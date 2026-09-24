/**
 * Editors, the desktop session (X11/Wayland and the macOS side), media and document
 * conversion, and the small everyday tools a terminal accumulates.
 */
export const DESKTOP_COMMANDS: string[] = [
  // ── Editors, pagers, the desktop side ─────────────────────────────────────────────
  "vim", "nvim", "neovim", "nano", "emacs", "gedit", "code", "codium", "subl", "micro",
  "kakoune", "helix", "open", "xdg-open", "pbcopy", "pbpaste", "xclip", "xsel", "wl-copy",
  "wl-paste", "xdotool", "wmctrl", "xrandr", "xset", "notify-send", "dconf", "gsettings",
  "osascript", "defaults", "diskutil", "hdiutil", "plutil", "caffeinate", "softwareupdate",
  "networksetup", "codesign", "notarytool", "productbuild", "pkgbuild", "installer",
  "system_profiler", "ioreg", "kextstat", "nvram", "pmset", "scutil", "dscl", "spctl",
  "csrutil", "tmutil", "mdfind", "mdls", "say", "screencapture", "sips", "textutil",
  "qlmanage", "sw_vers", "alacritty", "kitty", "wezterm", "ghostty", "konsole", "xterm",
  "urxvt", "tmuxinator", "xvfb-run", "xhost", "xauth", "xprop", "xwininfo", "xkill",
  "xmodmap", "setxkbmap", "swaymsg", "hyprctl", "grim", "slurp", "flameshot", "scrot", "maim",
  "feh", "sxiv", "nautilus", "thunar", "ranger", "nnn", "vifm", "yazi", "gio", "vncviewer",
  "x11vnc", "ditto", "dot_clean", "mdimport", "mdutil", "vm_stat", "fs_usage", "nettop",
  "powermetrics", "sysdiagnose", "pkgutil", "stapler", "altool", "bless", "shortcuts",
  "automator", "wdutil", "airport", "vimtutor",

  // ── Media, documents, images ──────────────────────────────────────────────────────
  "ffmpeg", "ffprobe", "ffplay", "imagemagick", "magick", "mogrify", "convert", "identify",
  "composite", "exiftool", "tesseract", "optipng", "jpegoptim", "pngquant", "cwebp", "svgo",
  "inkscape", "gimp", "sox", "lame", "flac", "mpv", "mplayer", "vlc", "yt-dlp", "youtube-dl",
  "handbrakecli", "pdftk", "qpdf", "pdftoppm", "pdftotext", "pdfinfo", "ghostscript",
  "gnuplot", "rscript", "mediainfo", "mkvmerge", "mkvextract", "graphicsmagick", "jhead",
  "dcraw", "potrace", "rsvg-convert", "oxipng", "gifsicle", "webpmux", "avifenc", "qrencode",
  "zbarimg", "blender", "opusenc", "oggenc", "darktable-cli", "pdfunite", "pdfseparate",
  "pdfimages", "pdffonts", "pdfgrep", "pdfjam", "ocrmypdf", "img2pdf", "weasyprint",
  "wkhtmltopdf", "libreoffice", "soffice", "unoconv", "catdoc", "antiword", "ssconvert",

  // ── The everyday extras ───────────────────────────────────────────────────────────
  "fzf", "tldr", "bat", "exa", "eza", "lsd", "man", "info", "apropos", "date", "units",
  "clear", "reset", "tput", "stty", "script", "tabs", "starship", "zoxide", "autojump",
  "broot", "procs", "entr", "fswatch", "inotifywait", "parallel", "sponge", "vidir",
  "watchexec", "cheat", "asciinema", "vhs", "gum", "glow", "slides", "timew", "khal", "khard",
  "vdirsyncer", "newsboat", "w3m", "lynx", "elinks", "chafa", "viu", "timg", "progress",
  "tree-sitter",
];
