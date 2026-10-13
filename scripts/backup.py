"""Read-only database and Storage export; only encrypted output leaves the runner."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timezone

PROJECT = "dfvuynqpfpgeekgoksyu"
IMAGE = "postgres:17.6"

def run(args, **kwargs):
    # Never print subprocess output: it can contain database rows or object paths.
    try:
        return subprocess.run(args, check=True, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, **kwargs).stdout
    except subprocess.CalledProcessError as exc:
        error = (exc.stderr or b"").decode(errors="replace").lower()
        categories = [
            ("password authentication failed", "Database password authentication failed"),
            ("tenant or user not found", "Pooler project or user not found"),
            ("permission denied", "Database export permission denied"),
            ("could not translate host name", "Database DNS resolution failed"),
            ("connection timed out", "Database connection timed out"),
            ("unsupported startup parameter", "Pooler rejected a startup parameter"),
            ("unrecognized configuration parameter", "Unsupported database connection parameter"),
        ]
        label = next((label for pattern, label in categories if pattern in error),
                     "Command failed; raw output suppressed")
        print(label, file=sys.stderr)
        raise

def pg(args):
    return run(["docker", "run", "--rm", "-i", "--network", "host",
                *sum((["-e", k] for k in ("PGHOST", "PGPORT", "PGUSER", "PGDATABASE",
                    "PGPASSWORD", "PGSSLMODE", "PGCONNECT_TIMEOUT", "PGOPTIONS")), []),
                IMAGE, *args])

def query(sql):
    return pg(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql]).decode().strip()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Storage redirect refused")

def download_objects(objects, target, key):
    manifest = []
    opener = urllib.request.build_opener(NoRedirect())
    for index, obj in enumerate(objects):
        # Store under generated names so remote names cannot escape the directory.
        relative = f"storage/{index:08d}.bin"
        path = target / relative
        url = (f"https://{PROJECT}.supabase.co/storage/v1/object/authenticated/"
               + urllib.parse.quote(obj["bucket_id"], safe="") + "/"
               + urllib.parse.quote(obj["name"], safe="/").replace(".", "%2E"))
        request = urllib.request.Request(url, headers={"apikey": key,
                     "Authorization": "Bearer " + key})
        digest = hashlib.sha256()
        size = 0
        with opener.open(request, timeout=120) as response, path.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                digest.update(chunk)
                size += len(chunk)
        expected = (obj.get("metadata") or {}).get("size")
        if expected is not None and size != int(expected):
            raise RuntimeError("Storage size mismatch")
        manifest.append({**obj, "backup_file": relative, "sha256": digest.hexdigest(), "bytes": size})
    return manifest

def main():
    for name in ("SUPABASE_DB_PASSWORD", "BACKUP_ENCRYPTION_PASSWORD", "SUPABASE_SERVICE_ROLE_KEY"):
        if not os.environ.get(name):
            raise RuntimeError("Required secret missing: " + name)
    if len(os.environ["BACKUP_ENCRYPTION_PASSWORD"]) < 32:
        raise RuntimeError("Encryption password must have at least 32 characters")
    os.environ.update(PGHOST="aws-0-ap-northeast-1.pooler.supabase.com", PGPORT="5432",
        PGUSER="postgres." + PROJECT, PGDATABASE="postgres",
        PGPASSWORD=os.environ["SUPABASE_DB_PASSWORD"], PGSSLMODE="require",
        PGCONNECT_TIMEOUT="30", PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=600000")
    output = Path(os.environ["BACKUP_OUTPUT_DIR"]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="livehouse-backup-") as temp:
        work = Path(temp)
        payload = work / "payload"
        payload.mkdir()
        (payload / "storage").mkdir()
        started = datetime.now(timezone.utc).isoformat()
        print("Checking database connection", flush=True)
        version = query("show server_version;")
        if not version.startswith("17."):
            raise RuntimeError("Database major version changed; update backup client")
        objects_sql = "select coalesce(json_agg(x order by x.bucket_id,x.name),'[]'::json)::text from (select bucket_id,name,metadata,version from storage.objects) x;"
        print("Reading Storage inventory", flush=True)
        inventory = json.loads(query(objects_sql))
        schemas = ["public", "auth", "storage"]
        if query("select exists(select 1 from pg_namespace where nspname='supabase_migrations');") == "t":
            schemas.append("supabase_migrations")
        print("Exporting database", flush=True)
        dump = pg(["pg_dump", "--format=custom", "--no-owner",
                   "--lock-wait-timeout=30s", *sum((["--schema", s] for s in schemas), [])])
        if not dump.startswith(b"PGDMP"):
            raise RuntimeError("Invalid database dump")
        (payload / "database.dump").write_bytes(dump)
        # Read every section, not just the archive's table of contents.
        pg(["pg_restore", "--file=/dev/null"], input=dump)
        print("Exporting roles", flush=True)
        (payload / "roles.sql").write_bytes(pg(["pg_dumpall", "--roles-only", "--no-role-passwords"]))
        print("Downloading Storage files", flush=True)
        manifest = download_objects(inventory, payload, os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        if json.loads(query(objects_sql)) != inventory:
            raise RuntimeError("Storage changed during backup; rerun at a quiet time")
        metadata = {"project": PROJECT, "started_at": started,
            "finished_at": datetime.now(timezone.utc).isoformat(), "server_version": version,
            "schemas": schemas, "objects": manifest,
            "limitations": ["Storage and database are not one atomic snapshot",
               "Platform configuration, API keys, role passwords and Vault root key are not included",
               "Restoration into a separate Supabase project must be tested before relying on this backup"]}
        (payload / "manifest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
        hashes = {str(p.relative_to(payload)): hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in payload.rglob("*") if p.is_file()}
        (payload / "checksums.json").write_text(json.dumps(hashes, indent=2))
        archive = work / "backup.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(payload, arcname="backup")
        print("Encrypting and verifying", flush=True)
        encrypted = output / "backup.tar.gz.gpg"
        common = ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback",
                  "--passphrase-fd", "0"]
        password = os.environ["BACKUP_ENCRYPTION_PASSWORD"].encode() + b"\n"
        run([*common, "--symmetric", "--cipher-algo", "AES256", "--s2k-mode", "3",
             "--s2k-count", "65011712", "--output", str(encrypted), str(archive)], input=password)
        restored = work / "verified.tar.gz"
        run([*common, "--decrypt", "--output", str(restored), str(encrypted)], input=password)
        if hashlib.sha256(restored.read_bytes()).digest() != hashlib.sha256(archive.read_bytes()).digest():
            raise RuntimeError("Encryption round-trip verification failed")
        (output / "backup.tar.gz.gpg.sha256").write_text(
            hashlib.sha256(encrypted.read_bytes()).hexdigest() + "  backup.tar.gz.gpg\n")
        print("Database archive, Storage download and encryption round-trip checks passed.")

if __name__ == "__main__":
    os.umask(0o077)
    try:
        main()
    except Exception as exc:
        if isinstance(exc, RuntimeError) and (str(exc).startswith("Required secret missing:") or str(exc) == "Encryption password must have at least 32 characters"):
            print(str(exc), file=sys.stderr)
        # Fail closed; do not upload incomplete output or disclose raw exceptions.
        output = os.environ.get("BACKUP_OUTPUT_DIR")
        if output:
            shutil.rmtree(output, ignore_errors=True)
        print("Backup failed. Check secret names, credentials, client version and Storage consistency. No backup was uploaded.", file=sys.stderr)
        sys.exit(1)
