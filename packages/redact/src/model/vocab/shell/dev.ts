/**
 * The developer's terminal: version control, build, one section per language ecosystem,
 * then containers, cloud, databases and the scanners. The densest half of the volume, and
 * the one a conversation about a codebase types every other line.
 */
export const DEV_COMMANDS: string[] = [
  // ── Version control ───────────────────────────────────────────────────────────────
  "git", "gitk", "git-lfs", "tig", "lazygit", "gitui", "glab", "svn", "bzr", "fossil", "cvs",
  "pre-commit", "commitizen", "darcs", "repo", "git-crypt", "gitleaks", "difftool",

  // ── Build systems, compilers, binaries ────────────────────────────────────────────
  "make", "gmake", "cmake", "ctest", "cpack", "ninja", "meson", "scons", "bazel", "autoconf",
  "automake", "autoreconf", "aclocal", "libtool", "pkg-config", "gcc", "clang", "clangd",
  "clang-format", "clang-tidy", "cpp", "ccache", "sccache", "distcc", "bison", "yacc", "flex",
  "swig", "nasm", "yasm", "objdump", "objcopy", "readelf", "addr2line", "ranlib", "strip",
  "ldconfig", "ldd", "otool", "lipo", "dsymutil", "install_name_tool", "ctags", "gtags",
  "cscope", "bmake", "waf", "xmake", "premake", "conan", "vcpkg", "spack", "pkgconf", "mold",
  "lld", "gcov", "lcov", "gcovr", "gprof", "cppcheck", "include-what-you-use",

  // ── JavaScript / TypeScript ───────────────────────────────────────────────────────
  "node", "nodejs", "deno", "bun", "bunx", "npm", "pnpm", "yarn", "corepack", "npx", "nvm",
  "fnm", "volta", "tsc", "tsx", "ts-node", "eslint", "prettier", "biome", "stylelint",
  "webpack", "vite", "rollup", "esbuild", "parcel", "babel", "turbo", "jest", "vitest",
  "mocha", "karma", "playwright", "cypress", "storybook", "electron", "expo", "ionic",
  "capacitor", "nuxt", "astro", "jekyll", "eleventy", "gulp", "grunt", "browserify", "swc",
  "tsup", "rspack", "nodemon", "concurrently", "husky", "lint-staged", "commitlint",
  "semantic-release", "lerna", "http-server", "live-server", "verdaccio", "changeset", "nyc",
  "wdio", "testcafe", "nightwatch",

  // ── Python ────────────────────────────────────────────────────────────────────────
  "python", "python3", "pip", "pip3", "pipx", "poetry", "pdm", "hatch", "conda", "mamba",
  "micromamba", "virtualenv", "pyenv", "pytest", "tox", "nox", "ruff", "flake8", "pylint",
  "mypy", "isort", "autopep8", "bandit", "twine", "cython", "jupyter", "ipython", "celery",
  "pipenv", "pyright", "pyinstaller", "alembic", "django-admin", "scrapy", "nbconvert",
  "papermill", "dvc", "mlflow", "wandb", "airflow", "prefect", "dagster", "pyupgrade",

  // ── Ruby, PHP, Perl ───────────────────────────────────────────────────────────────
  "gem", "bundle", "bundler", "rake", "irb", "rails", "rspec", "rubocop", "puma", "sidekiq",
  "php", "composer", "artisan", "phpunit", "pecl", "pear", "perl", "cpan", "cpanm", "raku",
  "erb", "rdoc", "foreman", "capistrano", "laravel", "symfony", "drush", "phpstan", "psalm",
  "php-cs-fixer", "magento",

  // ── JVM ───────────────────────────────────────────────────────────────────────────
  "java", "javac", "javadoc", "javap", "jar", "jarsigner", "jdb", "jps", "jstack", "jmap",
  "jstat", "jcmd", "jshell", "jlink", "mvn", "gradle", "gradlew", "sbt", "kotlinc", "scalac",
  "groovy", "jenv", "jbang", "jconsole", "jvisualvm", "kotlin", "ktlint", "detekt",
  "spotbugs", "checkstyle", "pmd", "lein", "clojure", "clj", "babashka", "gradle-wrapper",

  // ── Go, Rust, .NET ────────────────────────────────────────────────────────────────
  "gofmt", "godoc", "golangci-lint", "goreleaser", "dlv", "rustc", "rustup", "cargo",
  "clippy", "rustfmt", "rustdoc", "wasm-pack", "dotnet", "nuget", "msbuild", "csc", "gopls",
  "goimports", "govulncheck", "staticcheck", "mockgen", "bandwhich", "gping", "xsv",
  "qsv", "hexyl", "atuin", "mcfly", "vbc", "fsi", "paket",

  // ── Mobile, native, WebAssembly ───────────────────────────────────────────────────
  "flutter", "dart", "adb", "fastboot", "scrcpy", "aapt", "apktool", "zipalign", "xcodebuild",
  "xcrun", "xcode-select", "simctl", "instruments", "agvtool", "swiftc", "fastlane",
  "carthage", "pod", "cocoapods", "emcc", "emscripten", "wasmtime", "wasmer", "wasm-opt",
  "protoc", "buf", "thrift", "react-native", "swiftlint", "swiftformat", "xcpretty", "xcodes",
  "emulator", "avdmanager", "sdkmanager", "bundletool", "apksigner", "ndk-build", "wasmedge",

  // ── Runtime & environment managers ────────────────────────────────────────────────
  "asdf", "mise", "direnv", "nix", "nix-env", "nix-shell", "nixos-rebuild", "home-manager",
  "guix", "rbenv", "sdk", "goenv", "tfenv", "luaver",

  // ── Containers, orchestration, infrastructure, cloud ──────────────────────────────
  "docker", "dockerd", "docker-compose", "podman", "nerdctl", "crictl", "containerd",
  "skopeo", "buildah", "lxc", "lxd", "vagrant", "virsh", "virt-install", "qemu", "kubectl",
  "kubeadm", "minikube", "k9s", "kustomize", "helmfile", "argocd", "istioctl", "linkerd",
  "eksctl", "terraform", "terragrunt", "opentofu", "tflint", "tfsec", "checkov", "infracost",
  "pulumi", "ansible", "ansible-playbook", "ansible-vault", "puppet", "chef", "vault",
  "consul", "nomad", "etcdctl", "gcloud", "gsutil", "doctl", "flyctl", "heroku", "vercel",
  "netlify", "wrangler", "firebase", "supabase", "serverless", "localstack", "minio", "ctr",
  "runc", "crun", "dive", "docker-machine", "kubectx", "kubens", "kubeseal", "velero",
  "rancher", "kops", "talosctl", "k3s", "k3d", "colima", "orbstack", "multipass", "incus",
  "aws-vault", "saml2aws", "chamber", "amplify", "cdk", "cdktf", "ibmcloud", "openstack",
  "hcloud", "scw", "linode-cli", "terrascan", "kube-bench",

  // ── Databases & data ──────────────────────────────────────────────────────────────
  "psql", "pgcli", "pg_dump", "pg_restore", "pg_ctl", "pgbench", "initdb", "createdb",
  "dropdb", "createuser", "mysql", "mysqldump", "mysqladmin", "mariadb", "sqlite3", "sqlplus",
  "mongo", "mongosh", "mongodump", "mongorestore", "influx", "clickhouse-client", "cqlsh",
  "beeline", "duckdb", "dbt", "sqlfluff", "kcat", "rabbitmqctl", "hdfs", "spark-submit",
  "flink", "pg_isready", "pg_basebackup", "vacuumdb", "reindexdb", "pgloader", "mysqlcheck",
  "mysqlbinlog", "mydumper", "redis-benchmark", "valkey-cli", "mongoexport", "mongoimport",
  "mongostat", "nodetool", "neo4j", "cypher-shell", "prisma", "drizzle-kit", "knex", "flyway",
  "liquibase", "sqlcmd", "bcp", "isql", "edgedb", "surreal", "kafkacat",

  // ── Quality, security scanners, load testing ──────────────────────────────────────
  "shellcheck", "shfmt", "yamllint", "hadolint", "trivy", "grype", "syft", "semgrep", "snyk",
  "trufflehog", "cloc", "tokei", "scc", "wrk", "siege", "locust", "jmeter", "lynis",
  "clamscan", "freshclam", "rkhunter", "chkrootkit", "osquery", "osqueryi", "binwalk",
  "radare2", "checksec", "oscap", "tripwire", "codeql", "sonar-scanner", "vegeta",
];
