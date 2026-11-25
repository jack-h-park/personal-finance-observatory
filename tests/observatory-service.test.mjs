import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const label = "com.jackpark.stock-observatory";

function fixture(t, mode) {
  const bin = mkdtempSync(join(tmpdir(), "observatory-launchd-test-"));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  const log = join(bin, "commands");
  writeFileSync(log, "");
  const stub = (name, body) =>
    writeFileSync(join(bin, name), `#!/bin/sh\nprintf '%s %s\\n' "${name}" "$*" >> "$COMMAND_LOG"\n${body}\n`, {
      mode: 0o755,
    });
  stub("id", '[ "$1" = -un ] && echo runtime || echo 502');
  stub("launchctl", `
    case "$1" in
      print)
        case "$REGISTRATION:$2" in
          system:system/${label}|gui:gui/502/${label}) echo '  state = running' ;;
          *) exit 113 ;;
        esac ;;
      list) if [ "$REGISTRATION" = background ]; then printf '123 0 %s\\n' "${label}"; fi ;;
      kickstart) ;;
      *) exit 98 ;;
    esac
  `);
  stub("ssh", "echo 2026-11-25");
  stub("git", '[ "$1" != rev-parse ] || echo test-head');
  stub("node", "exit 0");
  stub("pnpm", "exit 0");
  stub("plutil", 'case "$2" in UserName) echo runtime ;; WorkingDirectory) pwd -P ;; *) exit 99 ;; esac');
  return {
    run: (cmd, args, env = {}) =>
      spawnSync(cmd, args, {
        cwd: repo,
        encoding: "utf8",
        env: {
          PATH: `${bin}:/usr/bin:/bin`,
          HOME: bin,
          STOCK_DB_PATH: join(bin, "db"),
          STOCK_PROD_HOST: "test-host",
          COMMAND_LOG: log,
          REGISTRATION: mode,
          ...env,
        },
      }),
    commands: () => readFileSync(log, "utf8"),
  };
}

test("system registration blocks legacy deploy and database pull before either mutates", (t) => {
  const f = fixture(t, "system");
  for (const target of ["redeploy", "restart", "install-service", "uninstall-service", "stop"]) {
    const result = f.run("make", [target]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /installed web service/);
  }
  const pull = f.run("bash", ["scripts/pull-prod-db.sh", "--dry-run"]);
  assert.equal(pull.status, 1);
  assert.match(pull.stderr, /database is the source/);
  assert.doesNotMatch(f.commands(), /^(git|pnpm|ssh) |launchctl (bootout|kickstart)/m);
  const status = f.run("bash", ["deploy/observatory-service.sh", "status"]);
  assert.equal(status.status, 0);
  assert.match(status.stdout, /system\/com\.jackpark\.stock-observatory/);
});

test("system redeploy prepares as runtime and prints a separate administrator activation", (t) => {
  const f = fixture(t, "system");
  const result = f.run("make", ["prepare-system-redeploy"], { HOME: "/Users/runtime" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sudo launchctl kickstart -k system\/com\.jackpark\.stock-observatory/);
  assert.match(f.commands(), /^pnpm refresh$/m);
  assert.doesNotMatch(f.commands(), /^launchctl (bootout|kickstart)/m);
});

test("GUI deployment uses its GUI domain, and a registered GUI service guards database pull", (t) => {
  const f = fixture(t, "gui");
  const restart = f.run("bash", ["deploy/observatory-service.sh", "restart-gui"]);
  assert.equal(restart.status, 0);
  assert.match(f.commands(), /^launchctl kickstart -k gui\/502\/com\.jackpark\.stock-observatory$/m);
  const pull = f.run("bash", ["scripts/pull-prod-db.sh", "--dry-run"]);
  assert.equal(pull.status, 1);
  assert.doesNotMatch(f.commands(), /^ssh /m);
});

test("a current-session background declaration still guards database pull", (t) => {
  const f = fixture(t, "background");
  const pull = f.run("bash", ["scripts/pull-prod-db.sh", "--dry-run"]);
  assert.equal(pull.status, 1);
  assert.doesNotMatch(f.commands(), /^ssh /m);
});

test("a development dry run with no service registration can query the remote source", (t) => {
  const f = fixture(t, "none");
  const pull = f.run("bash", ["scripts/pull-prod-db.sh", "--dry-run"]);
  assert.equal(pull.status, 0, pull.stderr);
  assert.match(pull.stdout, /dry run: nothing copied/);
  assert.match(f.commands(), /^ssh test-host sqlite3 -readonly /m);
});
