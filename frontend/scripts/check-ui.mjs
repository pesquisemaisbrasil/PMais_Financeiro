// Falha se houver controle nativo fora de components/ui ou SelectItem com value vazio.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const only = process.argv.slice(2); // opcional: restringe a caminhos relativos a src/

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

const files = walk(ROOT).filter((f) => !relative(ROOT, f).replaceAll("\\", "/").startsWith("components/ui/"));
const scoped = only.length
  ? files.filter((f) => only.some((o) => relative(ROOT, f).replaceAll("\\", "/").startsWith(o)))
  : files;

const banned = [
  [/<button(\s|>|$)/, "<button> → Button (R1)"],
  [/<select(\s|>|$)/, "<select> → Select (R3)"],
  [/<textarea(\s|>|$)/, "<textarea> → Textarea (R2)"],
  [/<table(\s|>|$)/, "<table> → Table (R8)"],
  [/<SelectItem[^>]*value=""/, 'SelectItem value="" quebra o Radix (R3)'],
];

// checagem por linha (regexes simples, cobrem a tag toda numa linha só)
let failures = 0;
for (const f of scoped) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const [re, msg] of banned) {
      if (re.test(line)) {
        console.error(`${relative(ROOT, f)}:${i + 1}  ${msg}`);
        failures++;
      }
    }
  });
}

// checagem multi-linha: <input ... type="checkbox|radio" ...> pode ter o atributo
// type= em outra linha que a abertura da tag, então casa no arquivo inteiro.
const inputCheckboxRadioRe = /<input\b[^>]*?type="(checkbox|radio)"/gs;
for (const f of scoped) {
  const content = readFileSync(f, "utf8");
  for (const match of content.matchAll(inputCheckboxRadioRe)) {
    const line = content.slice(0, match.index).split("\n").length;
    console.error(`${relative(ROOT, f)}:${line}  checkbox/radio nativo → Checkbox/RadioGroup (R5/R6)`);
    failures++;
  }
}

if (failures) {
  console.error(`\n${failures} problema(s).`);
  process.exit(1);
}
console.log(`check-ui OK (${scoped.length} arquivos)`);
