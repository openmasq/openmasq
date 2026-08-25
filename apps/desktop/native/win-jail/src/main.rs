//! `<slug>-jail.exe` (see `packages/branding`) — the WINDOWS half of the `run_python` jail.
//!
//! It is the third member of a family whose other two are OS-provided: macOS has
//! `sandbox-exec` (seatbelt), Linux has `bwrap`, Windows has NOTHING equivalent on the
//! PATH. Confining a child on Windows means acting on its TOKEN, and Node exposes no
//! token API at any level — so without this binary `jailAvailability()` is `"none"` and
//! `sandbox.ts` refuses to run, which is the correct fail-closed behaviour but also means
//! no interpreter on the platform.
//!
//! Usage (built by `sandbox.ts` `jailedCmd`, never by a human):
//!
//!   <slug>-jail.exe --allow-read  <dir> [--allow-read <dir> …]
//!                   --allow-write <dir> [--allow-write <dir> …]
//!                   [--memory-mb N] [--timeout-ms N] [--active-processes N]
//!                   -- <program> [args…]
//!
//! ## What it actually enforces
//!
//! **Filesystem — default DENY.** The child runs inside an AppContainer: a distinct,
//! per-machine SID that has no access to the user's profile at all. This is STRONGER than
//! the macOS profile, which is `(allow file-read*)` minus a deny-list of known secrets —
//! there, a credential store nobody thought to list stays readable. Here nothing is
//! readable until this launcher grants it, so the failure mode of forgetting a path is a
//! broken run, not a silent leak.
//!
//! **Network — NONE.** An AppContainer reaches the network only through capabilities, and
//! we pass an EMPTY capability set. No `internetClient`, therefore no sockets — not even
//! loopback, which is why the egress proxy is not wired on Windows yet (the loopback
//! exemption is a machine-wide, admin-only `CheckNetIsolation` change, so buying it would
//! cost an elevation prompt at install). Documented as a v1 residual: market-data code
//! that works on macOS returns a connection error here rather than data.
//!
//! **Resources — a Job Object.** Memory ceiling, process count, and
//! `KILL_ON_JOB_CLOSE` so the whole tree dies with this launcher. It replaces the POSIX
//! `ulimit` wrapper, which `withRlimits` skips on Windows for lack of a shell.
//!
//! ## Two things this deliberately does NOT do
//!
//! It does not create the scratch directory (the caller owns its lifecycle), and it does
//! not clean up ACLs on exit: the granted dirs are per-run and removed by the caller, and
//! an ACL on a deleted directory is not a residue. The AppContainer PROFILE is per-machine
//! and reused across runs — creating it is idempotent.
//!
//! ⚠️ Anything added here runs BEFORE the sandbox exists and with the user's full rights.
//! Keep it small, keep it free of parsing that isn't argv, and never let it read a file.

use std::ffi::OsStr;
use std::iter::once;
use std::os::windows::ffi::OsStrExt;
use std::ptr::{null, null_mut};

use windows_sys::Win32::Foundation::{CloseHandle, FALSE, HANDLE, TRUE, WAIT_TIMEOUT};
use windows_sys::Win32::Security::Authorization::{
    GetNamedSecurityInfoW, SetEntriesInAclW, SetNamedSecurityInfoW, EXPLICIT_ACCESS_W,
    GRANT_ACCESS, NO_MULTIPLE_TRUSTEE, SE_FILE_OBJECT, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN,
    TRUSTEE_W,
};
use windows_sys::Win32::Security::Isolation::{
    CreateAppContainerProfile, DeriveAppContainerSidFromAppContainerName,
};
use windows_sys::Win32::Security::{
    ACL, DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, PSID, SECURITY_CAPABILITIES,
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_GENERIC_EXECUTE, FILE_GENERIC_READ, FILE_GENERIC_WRITE,
};
use windows_sys::Win32::System::Console::{
    GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
};
use windows_sys::Win32::System::JobObjects::{
    CreateJobObjectW, SetInformationJobObject, TerminateJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_ACTIVE_PROCESS, JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION,
    JOB_OBJECT_LIMIT_JOB_MEMORY, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    JOB_OBJECT_LIMIT_PROCESS_MEMORY,
};
use windows_sys::Win32::System::Threading::{
    CreateProcessW, DeleteProcThreadAttributeList, GetExitCodeProcess,
    InitializeProcThreadAttributeList, UpdateProcThreadAttribute, WaitForSingleObject,
    EXTENDED_STARTUPINFO_PRESENT, INFINITE, LPPROC_THREAD_ATTRIBUTE_LIST, PROCESS_INFORMATION,
    PROC_THREAD_ATTRIBUTE_JOB_LIST, PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
    STARTF_USESTDHANDLES, STARTUPINFOEXW,
};

/// Per-machine AppContainer profile. Stable on purpose: creating it is idempotent, and a
/// per-run profile would leak one registry entry per Python call. The brand half comes
/// from `packages/branding/branding.json`, injected at compile time by `build.rs` — the
/// produced value is unchanged.
const PROFILE: &str = concat!(env!("BRAND_NAME"), "PythonJail");

fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(once(0)).collect()
}

fn die(msg: &str) -> ! {
    // stderr, never stdout: stdout is the RUN's output and is parsed by the caller.
    eprintln!("[{}-jail] {msg}", env!("BRAND_SLUG"));
    std::process::exit(127);
}

// ---------------------------------------------------------------- argv

struct Args {
    read: Vec<String>,
    write: Vec<String>,
    memory_mb: u64,
    timeout_ms: u64,
    active_processes: u32,
    cmd: Vec<String>,
}

fn parse_args() -> Args {
    let mut a = Args {
        read: Vec::new(),
        write: Vec::new(),
        memory_mb: 4096,
        timeout_ms: 0, // 0 ⇒ wait forever; the CALLER owns the wall-clock kill
        active_processes: 64,
        cmd: Vec::new(),
    };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--allow-read" => a.read.push(it.next().unwrap_or_else(|| die("--allow-read needs a path"))),
            "--allow-write" => a.write.push(it.next().unwrap_or_else(|| die("--allow-write needs a path"))),
            "--memory-mb" => {
                a.memory_mb = it.next().and_then(|v| v.parse().ok()).unwrap_or_else(|| die("--memory-mb needs a number"))
            }
            "--timeout-ms" => {
                a.timeout_ms = it.next().and_then(|v| v.parse().ok()).unwrap_or_else(|| die("--timeout-ms needs a number"))
            }
            "--active-processes" => {
                a.active_processes =
                    it.next().and_then(|v| v.parse().ok()).unwrap_or_else(|| die("--active-processes needs a number"))
            }
            "--" => {
                a.cmd = it.collect();
                break;
            }
            other => die(&format!("unknown flag: {other}")),
        }
    }
    if a.cmd.is_empty() {
        die("no program after `--`");
    }
    a
}

/// Windows command-line quoting (the CreateProcessW rules), applied per argument.
fn quote(arg: &str) -> String {
    if !arg.is_empty() && !arg.contains([' ', '\t', '"']) {
        return arg.to_string();
    }
    let mut out = String::from("\"");
    let mut backslashes = 0usize;
    for c in arg.chars() {
        match c {
            '\\' => {
                backslashes += 1;
                out.push('\\');
            }
            '"' => {
                // Every backslash immediately before a quote must be doubled, then the
                // quote itself escaped — otherwise an argument ending in `\` swallows it.
                for _ in 0..=backslashes {
                    out.push('\\');
                }
                backslashes = 0;
                out.push('"');
            }
            _ => {
                backslashes = 0;
                out.push(c);
            }
        }
    }
    for _ in 0..backslashes {
        out.push('\\');
    }
    out.push('"');
    out
}

// ---------------------------------------------------------------- container

/// Create (or reuse) the AppContainer profile and return its SID.
fn container_sid() -> PSID {
    let name = wide(PROFILE);
    let display = wide(concat!(env!("BRAND_NAME"), " Python jail"));
    let desc = wide("Sandbox for model-generated Python");
    let mut sid: PSID = null_mut();
    // No capabilities: an empty set is what removes network access.
    let hr = unsafe { CreateAppContainerProfile(name.as_ptr(), display.as_ptr(), desc.as_ptr(), null(), 0, &mut sid) };
    if hr == 0 {
        return sid;
    }
    // HRESULT_FROM_WIN32(ERROR_ALREADY_EXISTS) — the profile survives across runs, so this
    // is the NORMAL path after the first ever call. Written as the literal rather than
    // assembled from shifts: `1 << 31` on an i32 is an overflow Rust rejects, and the
    // arithmetic bought nothing a constant doesn't say more plainly.
    const HR_ALREADY_EXISTS: i32 = 0x8007_00B7u32 as i32;
    if hr == HR_ALREADY_EXISTS {
        let mut derived: PSID = null_mut();
        let dhr = unsafe { DeriveAppContainerSidFromAppContainerName(name.as_ptr(), &mut derived) };
        if dhr != 0 {
            die(&format!("DeriveAppContainerSidFromAppContainerName failed: 0x{dhr:08x}"));
        }
        return derived;
    }
    die(&format!("CreateAppContainerProfile failed: 0x{hr:08x}"));
}

/// Add an inheritable ACE granting `sid` access to `path`. This is the ONLY thing that
/// makes anything visible to the child — the container starts with nothing.
fn grant(path: &str, sid: PSID, writable: bool) {
    let wpath = wide(path);
    let mut old_dacl: *mut ACL = null_mut();
    let mut sd: PSECURITY_DESCRIPTOR = null_mut();
    let rc = unsafe {
        GetNamedSecurityInfoW(
            wpath.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            &mut old_dacl,
            null_mut(),
            &mut sd,
        )
    };
    if rc != 0 {
        die(&format!("GetNamedSecurityInfoW({path}) failed: {rc}"));
    }

    let access = if writable {
        FILE_GENERIC_READ | FILE_GENERIC_WRITE | FILE_GENERIC_EXECUTE
    } else {
        FILE_GENERIC_READ | FILE_GENERIC_EXECUTE
    };
    // OBJECT_INHERIT | CONTAINER_INHERIT — the grant must reach files created later inside
    // the scratch, or the run's own output becomes unreadable to it.
    const INHERIT: u32 = 0x1 | 0x2;
    let ea = EXPLICIT_ACCESS_W {
        grfAccessPermissions: access,
        grfAccessMode: GRANT_ACCESS,
        grfInheritance: INHERIT,
        Trustee: TRUSTEE_W {
            pMultipleTrustee: null_mut(),
            MultipleTrusteeOperation: NO_MULTIPLE_TRUSTEE,
            TrusteeForm: TRUSTEE_IS_SID,
            // An AppContainer SID is neither a user nor a well-known group; the field is
            // informational, so the honest value is UNKNOWN rather than a wrong guess.
            TrusteeType: TRUSTEE_IS_UNKNOWN,
            ptstrName: sid as *mut u16,
        },
    };

    let mut new_dacl: *mut ACL = null_mut();
    let rc = unsafe { SetEntriesInAclW(1, &ea, old_dacl, &mut new_dacl) };
    if rc != 0 {
        die(&format!("SetEntriesInAclW({path}) failed: {rc}"));
    }
    let rc = unsafe {
        SetNamedSecurityInfoW(
            wpath.as_ptr() as *mut u16,
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            null_mut(),
            null_mut(),
            new_dacl,
            null_mut(),
        )
    };
    if rc != 0 {
        die(&format!("SetNamedSecurityInfoW({path}) failed: {rc}"));
    }
    // `new_dacl` and `sd` are LocalAlloc'd by the two calls above and are NOT freed here,
    // deliberately. This process grants three directories and then becomes a wait: the
    // allocations are a handful of bytes for the lifetime of one Python run, and the OS
    // reclaims them at exit. Trading that for two more `unsafe` frees — in the one binary
    // that runs with the user's full rights, BEFORE any sandbox exists — is the wrong side
    // of the deal. A launcher that leaks nothing but can double-free is worse than one that
    // holds a few bytes.
}

// ---------------------------------------------------------------- job

fn make_job(memory_mb: u64, active_processes: u32) -> HANDLE {
    let job = unsafe { CreateJobObjectW(null(), null()) };
    if job.is_null() {
        die("CreateJobObjectW failed");
    }
    let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    let bytes = (memory_mb as usize) * 1024 * 1024;
    info.ProcessMemoryLimit = bytes;
    info.JobMemoryLimit = bytes;
    info.BasicLimitInformation.ActiveProcessLimit = active_processes;
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_PROCESS_MEMORY
        | JOB_OBJECT_LIMIT_JOB_MEMORY
        | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
        | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION
        // The backstop that matters: when THIS launcher goes away — killed by the
        // caller's wall-clock timer, or crashed — the whole tree goes with it. Without
        // it a forked grandchild outlives the run, which is the Windows shape of the
        // orphan the POSIX process-group kill exists to prevent.
        | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let ok = unsafe {
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if ok == FALSE {
        die("SetInformationJobObject failed");
    }
    job
}

// ---------------------------------------------------------------- spawn

fn main() {
    let args = parse_args();
    let sid = container_sid();

    for p in &args.read {
        grant(p, sid, false);
    }
    for p in &args.write {
        grant(p, sid, true);
    }

    let job = make_job(args.memory_mb, args.active_processes);

    // Two attributes: the container identity, and the job the child is born INTO (rather
    // than assigned to afterwards — the gap between CreateProcess and AssignProcessToJob
    // is a window in which the child is unlimited and can leave offspring behind).
    let mut size: usize = 0;
    unsafe { InitializeProcThreadAttributeList(null_mut(), 2, 0, &mut size) };
    let mut buf = vec![0u8; size];
    let attrs = buf.as_mut_ptr() as LPPROC_THREAD_ATTRIBUTE_LIST;
    if unsafe { InitializeProcThreadAttributeList(attrs, 2, 0, &mut size) } == FALSE {
        die("InitializeProcThreadAttributeList failed");
    }

    let caps = SECURITY_CAPABILITIES {
        AppContainerSid: sid,
        Capabilities: null_mut(),
        CapabilityCount: 0,
        Reserved: 0,
    };
    if unsafe {
        UpdateProcThreadAttribute(
            attrs,
            0,
            PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES as usize,
            &caps as *const _ as *const _,
            std::mem::size_of::<SECURITY_CAPABILITIES>(),
            null_mut(), // lpPreviousValue: *mut c_void
            null(),     // lpReturnSize:   *const usize — NOT the same pointer type
        )
    } == FALSE
    {
        die("UpdateProcThreadAttribute(SECURITY_CAPABILITIES) failed");
    }
    let jobs = [job];
    if unsafe {
        UpdateProcThreadAttribute(
            attrs,
            0,
            PROC_THREAD_ATTRIBUTE_JOB_LIST as usize,
            jobs.as_ptr() as *const _,
            std::mem::size_of::<HANDLE>(),
            null_mut(),
            null(),
        )
    } == FALSE
    {
        die("UpdateProcThreadAttribute(JOB_LIST) failed");
    }

    // stdio is INHERITED so the caller's pipes reach python directly — the launcher never
    // reads or buffers the run's output (one less thing on the privileged side).
    let mut si: STARTUPINFOEXW = unsafe { std::mem::zeroed() };
    si.StartupInfo.cb = std::mem::size_of::<STARTUPINFOEXW>() as u32;
    si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    si.StartupInfo.hStdInput = unsafe { GetStdHandle(STD_INPUT_HANDLE) };
    si.StartupInfo.hStdOutput = unsafe { GetStdHandle(STD_OUTPUT_HANDLE) };
    si.StartupInfo.hStdError = unsafe { GetStdHandle(STD_ERROR_HANDLE) };
    si.lpAttributeList = attrs;

    let cmdline = args.cmd.iter().map(|a| quote(a)).collect::<Vec<_>>().join(" ");
    let mut cmdline_w = wide(&cmdline);
    let mut pi: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        CreateProcessW(
            null(),
            cmdline_w.as_mut_ptr(),
            null(),
            null(),
            TRUE, // inherit the std handles above
            EXTENDED_STARTUPINFO_PRESENT,
            null(),
            null(),
            &si as *const _ as *const _,
            &mut pi,
        )
    };
    if ok == FALSE {
        die("CreateProcessW failed (is the program readable by the container?)");
    }

    let wait = if args.timeout_ms == 0 { INFINITE } else { args.timeout_ms as u32 };
    let code = unsafe {
        let r = WaitForSingleObject(pi.hProcess, wait);
        if r == WAIT_TIMEOUT {
            TerminateJobObject(job, 1);
            1u32
        } else {
            let mut c: u32 = 1;
            GetExitCodeProcess(pi.hProcess, &mut c);
            c
        }
    };

    unsafe {
        DeleteProcThreadAttributeList(attrs);
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        // Closing the job kills anything still in it (KILL_ON_JOB_CLOSE).
        CloseHandle(job);
    }
    std::process::exit(code as i32);
}
