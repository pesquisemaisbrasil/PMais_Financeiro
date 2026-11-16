/**
 * Gera a demonstração na RAIZ de um site só dela e a empacota num ZIP para arrastar no Netlify
 * (Deploys → arrastar o arquivo). Sem link de volta ao protótipo, a menos que se peça.
 *
 * Uso: node scripts/package-demo.mjs
 *      DEMO_ZIP=C:/caminho/netlify-upload.zip node scripts/package-demo.mjs   (onde gravar o ZIP)
 *      DEMO_PROTOTYPE_URL=https://endereço node scripts/package-demo.mjs        (com link ao protótipo)
 *
 * O ZIP leva o `_headers` com a mesma política de segurança (CSP) do netlify.toml, para `/*`.
 * Não precisa de nenhuma biblioteca: o ZIP é escrito aqui mesmo (Node 22 ou mais novo).
 * docs/operations/publicar-a-versao-de-teste.md
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

export const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = path.join(FRONTEND, "out");
const ZIP = path.resolve(process.env.DEMO_ZIP ?? path.join(FRONTEND, ".demo-cache", "netlify-upload.zip"));

/** Gera o site da demonstração em out/, na raiz (o scripts/deploy-demo.mjs usa também). */
export function build() {
  const env = {
    ...process.env,
    DEMO_DIST_DIR: "out",
    DEMO_BASE_PATH: "",
    DEMO_PROTOTYPE_URL: process.env.DEMO_PROTOTYPE_URL ?? "",
  };
  const script = path.join(FRONTEND, "scripts", "build-demo.mjs");
  const result = spawnSync(process.execPath, [script], { cwd: FRONTEND, env, stdio: "inherit" });
  if (result.status !== 0) throw new Error("a geração da demonstração falhou");
}

export function headersFile() {
  const toml = fs.readFileSync(path.join(FRONTEND, "..", "netlify.toml"), "utf8");
  const csp = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/)?.[1];
  if (!csp) throw new Error("Não achei a Content-Security-Policy no netlify.toml");
  return [
    "/*",
    `  Content-Security-Policy: ${csp}`,
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
    "  Cross-Origin-Opener-Policy: same-origin",
    "",
  ].join("\n");
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

/** Um ZIP simples (deflate), com caminhos em "/", como o Netlify espera. */
function writeZip(entries, target) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const packed = zlib.deflateRawSync(data, { level: 6 });
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0x00210000, 10); // hora e data fixas: o ZIP sai igual a cada geração
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(0x00210000, 12);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.concat([...parts, centralBytes, end]));
}

// Só quando chamado direto (node scripts/package-demo.mjs), não quando outro script importa daqui.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    build();
    const entries = listFiles(OUT).map((file) => ({
      name: path.relative(OUT, file).split(path.sep).join("/"),
      data: fs.readFileSync(file),
    }));
    entries.push({ name: "_headers", data: Buffer.from(headersFile(), "utf8") });
    writeZip(entries, ZIP);
    const megabytes = (fs.statSync(ZIP).size / 1048576).toFixed(1);
    console.log(`[demo] ZIP pronto: ${ZIP} (${megabytes} MB, ${entries.length} arquivos)`);
    console.log("[demo] Atenção: o ZIP não leva a função das solicitações. Para ela, use scripts/deploy-demo.mjs.");
  } catch (error) {
    console.error(`[demo] ERRO: ${error.message}`);
    process.exit(1);
  }
}
