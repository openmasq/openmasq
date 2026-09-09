/**
 * The UNIX base: what a shell defines itself, and the tools that come with the system —
 * files, text, archives. `../shell/index.ts` holds the discipline that bounds every entry.
 */
export const UNIX_COMMANDS: string[] = [
  // ── Shells, builtins & keywords ───────────────────────────────────────────────────
  "alias", "unalias", "bind", "bindkey", "builtin", "caller", "command", "compgen",
  "complete", "compopt", "declare", "dirs", "disown", "echo", "enable", "eval", "exec",
  "exit", "export", "false", "getopts", "hash", "help", "history", "jobs", "kill", "let",
  "local", "logout", "mapfile", "popd", "printf", "pushd", "pwd", "read", "readarray",
  "readonly", "return", "set", "setopt", "unsetopt", "shift", "shopt", "source", "suspend",
  "test", "times", "trap", "true", "type", "typeset", "ulimit", "umask", "unset", "wait",
  "time", "autoload", "whence", "emulate", "zmodload", "coproc", "select", "login", "sudo",
  "doas", "pkexec", "runuser", "sudoedit", "env", "printenv", "envsubst", "getent", "bash",
  "zsh", "ksh", "tcsh", "csh", "busybox", "toybox", "pwsh", "powershell", "xonsh", "nushell",
  "elvish", "cmd", "getopt", "setsid", "flock", "nsenter", "unshare", "setpriv", "prlimit",
  "capsh", "gosu", "tini", "dumb-init", "expect", "dialog", "whiptail", "zenity", "ncal",

  // ── Files, directories, volumes ───────────────────────────────────────────────────
  "cat", "tac", "chmod", "chown", "chgrp", "chattr", "lsattr", "chcon", "setfacl", "getfacl",
  "xattr", "mkdir", "rmdir", "touch", "stat", "file", "find", "locate", "updatedb", "which",
  "whereis", "whatis", "tree", "link", "unlink", "readlink", "realpath", "basename",
  "dirname", "mktemp", "mkfifo", "mknod", "shred", "install", "truncate", "sync", "mount",
  "umount", "lsblk", "blkid", "mkfs", "fsck", "lsof", "fuser", "quota", "chroot", "rename",
  "fdupes", "losetup", "parted", "fdisk", "gdisk", "sfdisk", "mkswap", "swapon", "swapoff",
  "tune2fs", "e2fsck", "resize2fs", "dumpe2fs", "badblocks", "btrfs", "zpool", "cryptsetup",
  "lvcreate", "lvextend", "vgcreate", "pvcreate", "mdadm", "smartctl", "hdparm", "duf",
  "ncdu", "rclone", "restic", "unison", "rsnapshot", "stow", "chezmoi", "namei", "chflags",
  "attr", "getcap", "setcap", "filefrag", "ddrescue", "mkisofs", "genisoimage", "sshfs",
  "fusermount", "gocryptfs", "encfs", "veracrypt", "smbclient", "exportfs", "showmount",
  "udisksctl", "trash-cli", "syncthing", "lslocks", "lsns", "lsipc", "ipcs", "ipcrm",

  // ── Text processing ───────────────────────────────────────────────────────────────
  "grep", "egrep", "fgrep", "ripgrep", "ack", "sed", "awk", "gawk", "nawk", "mawk", "cut",
  "paste", "join", "sort", "shuf", "uniq", "comm", "tsort", "expand", "unexpand", "fold",
  "fmt", "head", "tail", "less", "more", "split", "csplit", "tee", "xargs", "yes", "seq",
  "factor", "expr", "numfmt", "strings", "xxd", "hexdump", "iconv", "recode", "dos2unix",
  "unix2dos", "rev", "base64", "base32", "cksum", "sum", "md5sum", "sha1sum", "sha224sum",
  "sha256sum", "sha384sum", "sha512sum", "b2sum", "shasum", "crc32", "uuencode", "uudecode",
  "diff", "diff3", "wdiff", "colordiff", "patch", "cmp", "sdiff", "vimdiff", "column",
  "pathchk", "look", "spell", "aspell", "hunspell", "ispell", "datamash", "gron", "jless",
  "xmllint", "xsltproc", "pandoc", "groff", "troff", "nroff", "latex", "pdflatex", "latexmk",
  "bibtex", "asciidoctor", "figlet", "cowsay", "lolcat", "neofetch", "fastfetch", "ugrep",
  "pcregrep", "mlr", "dasel", "htmlq", "tidy", "difftastic", "difft", "chronic", "ifne",
  "vipe", "errno", "csvsql", "csvstat", "in2csv", "xlsx2csv", "visidata", "tex", "asciidoc",
  "typst", "tectonic", "xelatex", "lualatex", "makeindex", "doxygen", "sphinx-build",
  "mkdocs", "mdbook",

  // ── Archives & compression ────────────────────────────────────────────────────────
  "tar", "gzip", "gunzip", "zcat", "gzcat", "pigz", "bzip2", "bunzip2", "bzcat", "pbzip2",
  "xzcat", "unxz", "lzma", "unlzma", "lzop", "lz4", "unlz4", "zstd", "unzstd", "brotli",
  "zip", "unzip", "zipinfo", "zipgrep", "compress", "uncompress", "cpio", "pax", "rar",
  "unrar", "p7zip", "7za", "unar", "lsar", "zstdcat", "zstdgrep", "tarsnap", "pixz",
];
