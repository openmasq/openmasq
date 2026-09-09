/**
 * Administering a machine: the network, the daemons it runs, its processes and services,
 * its accounts and its packages — plus the Windows console, which the agent also drives.
 */
export const SYSTEM_COMMANDS: string[] = [
  // ── Network: clients, name service, packets ───────────────────────────────────────
  "curl", "wget", "aria2c", "httpie", "grpcurl", "websocat", "traceroute", "tracepath", "mtr",
  "netstat", "dig", "kdig", "drill", "nslookup", "whois", "host", "ifconfig", "iwconfig",
  "nmcli", "nmtui", "route", "bridge", "arp", "ethtool", "iptables", "ip6tables", "nftables",
  "ufw", "firewall-cmd", "conntrack", "netcat", "telnet", "socat", "nmap", "tcpdump",
  "tshark", "ngrep", "iperf", "iperf3", "arping", "ping6", "vnstat", "iftop", "nethogs",
  "bmon", "speedtest", "resolvectl", "dnsmasq", "unbound", "openssl", "gpg", "gpg2",
  "keytool", "certbot", "mkcert", "cosign", "sops", "scp", "sftp", "rsync", "ftp", "tftp",
  "lftp", "mosh", "autossh", "sshd", "ssh-keygen", "ssh-add", "ssh-copy-id", "ssh-agent",
  "stunnel", "openvpn", "wireguard", "wg-quick", "tailscale", "ngrok", "cloudflared", "ncat",
  "nping", "nload", "dhclient", "dhcpcd", "ldapsearch", "kinit", "klist", "kdestroy",
  "smbpasswd", "rpcinfo", "snmpwalk", "snmpget", "ipmitool", "wpa_supplicant", "wpa_cli",
  "rfkill", "bluetoothctl", "hcitool", "blueutil", "ipvsadm", "keepalived", "croc",
  "wormhole", "hwclock", "ntpdate", "ntpq", "chronyc", "ssh",

  // ── Servers & daemons ─────────────────────────────────────────────────────────────
  "nginx", "apachectl", "httpd", "caddy", "traefik", "haproxy", "envoy", "varnish", "squid",
  "lighttpd", "tomcat", "jetty", "uwsgi", "gunicorn", "uvicorn", "supervisord",
  "supervisorctl", "pm2", "memcached", "redis-server", "redis-cli", "apache2ctl", "openresty",
  "varnishlog", "php-fpm", "unicorn", "rackup", "hypercorn", "sbatch", "squeue",
  "srun", "scancel", "sinfo", "qsub", "qstat", "qdel", "bsub",

  // ── Processes, services, the machine ──────────────────────────────────────────────
  "top", "htop", "btop", "atop", "glances", "pstree", "pgrep", "pkill", "killall", "pidof",
  "nice", "renice", "ionice", "taskset", "chrt", "numactl", "nohup", "timeout", "watch",
  "sleep", "uptime", "free", "vmstat", "iostat", "mpstat", "pidstat", "sar", "iotop", "dmesg",
  "journalctl", "systemctl", "systemd", "systemd-run", "systemd-analyze", "machinectl",
  "loginctl", "busctl", "hostnamectl", "timedatectl", "localectl", "networkctl", "launchctl",
  "service", "chkconfig", "initctl", "openrc", "runit", "crontab", "cron", "crond", "anacron",
  "batch", "logrotate", "auditctl", "ausearch", "setenforce", "getenforce", "sestatus",
  "semanage", "restorecon", "screen", "tmux", "zellij", "byobu", "dtach", "strace", "ltrace",
  "dtruss", "gdb", "lldb", "valgrind", "perf", "bpftrace", "bpftool", "sysdig", "stress",
  "hyperfine", "uname", "hostname", "hostid", "arch", "nproc", "stdbuf", "lscpu", "lsusb",
  "lspci", "lshw", "dmidecode", "inxi", "reboot", "shutdown", "poweroff", "halt", "sysctl",
  "modprobe", "lsmod", "udevadm", "kexec", "pmap", "slabtop", "numastat", "turbostat",
  "powertop", "sensors", "acpi", "nvidia-smi", "rocm-smi", "glxinfo", "vainfo", "chcpu",
  "auditd", "sshguard", "fail2ban-client", "crowdsec",

  // ── Users, sessions, mail ─────────────────────────────────────────────────────────
  "whoami", "who", "users", "groups", "logname", "passwd", "useradd", "usermod", "userdel",
  "groupadd", "groupmod", "groupdel", "gpasswd", "chsh", "chfn", "chpasswd", "chage",
  "lastlog", "last", "write", "mesg", "talk", "newgrp", "visudo", "vipw", "faillock",
  "keychain", "mail", "mailx", "mailq", "sendmail", "postfix", "postqueue", "msmtp", "mutt",
  "neomutt", "fetchmail", "procmail", "notmuch", "offlineimap", "dovecot", "sudoreplay",
  "utmpdump", "pam_tally2", "mailutils", "alpine", "aerc",

  // ── OS package managers ───────────────────────────────────────────────────────────
  "apt", "apt-get", "apt-cache", "aptitude", "dpkg", "rpm", "yum", "dnf", "zypper", "pacman",
  "yay", "paru", "emerge", "apk", "xbps-install", "opkg", "pkgin", "snap", "flatpak", "choco",
  "scoop", "winget", "port", "brew", "mas", "add-apt-repository", "debootstrap", "dpkg-query",
  "dpkg-reconfigure", "dpkg-deb", "alien", "rpmbuild", "rpm2cpio", "createrepo",
  "yumdownloader", "makepkg", "eselect", "nix-build", "nix-collect-garbage", "appimagetool",
  "pkg_add", "pamac", "abuild",

  // ── Windows ───────────────────────────────────────────────────────────────────────
  "robocopy", "xcopy", "tasklist", "taskkill", "netsh", "ipconfig", "reg", "regedit", "wmic",
  "certutil", "schtasks", "sfc", "chkdsk", "diskpart", "dism", "bcdedit", "wsl", "powercfg",
  "bitsadmin", "gpupdate", "gpresult", "nltest", "winrm", "psexec", "driverquery",
  "systeminfo", "slmgr", "mstsc", "clip", "findstr", "takeown", "icacls", "attrib", "fsutil",
  "msiexec", "wusa", "winsat", "powershell-core",
];
