import { readFileSync, readdirSync } from 'node:fs';
import YAML from 'yaml';
const fichiers = [];
for (const f of readdirSync('contenu')) {
  if (f.endsWith('.yaml')) fichiers.push(`contenu/${f}`);
}
for (const f of readdirSync('contenu/processus')) fichiers.push(`contenu/processus/${f}`);
const out = [];
for (const f of fichiers) {
  const d = YAML.parse(readFileSync(f, 'utf8')) ?? {};
  for (const [famille, liste] of Object.entries(d)) {
    if (!Array.isArray(liste)) continue;
    for (const e of liste) {
      if (e?.confiance === 'a_confirmer') {
        out.push({ f, famille, id: e.id, nom: e.nom ?? e.sigle, resume: e.resume ?? e.definition, liens: e.liens });
      }
      for (const champ of ['etapes', 'leviers']) {
        for (const s of e?.[champ] ?? []) {
          if (s?.confiance === 'a_confirmer') {
            out.push({ f, famille: `${champ} de ${e.id}`, id: s.id ?? `étape ${s.ordre}`, nom: s.action ?? s.quoi, resume: s.note ?? s.piege, liens: s.liens });
          }
        }
      }
    }
  }
}
console.log(JSON.stringify(out, null, 1));
console.error('total', out.length);
