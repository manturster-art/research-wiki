// check_all_locations.js — 12편의 모든 locations[] 훑어 숨은 OA 미러 탐색
const oa = require('./openalex_helper');

const DOIS = [
  ['SDG-Meter', '10.1007/978-3-031-21743-2_21'],
  ['LLMs public health finance', '10.1016/j.artmed.2025.103203'],
  ["Classification UN SDGs BERT", '10.1007/978-3-032-12879-9_24'],
  ['Automated Extraction Financial', '10.1007/s13369-026-11157-6'],
  ['Social Tagging Environmental', '10.1007/978-3-032-09271-7_9'],
  ['Environment political economics', '10.1016/j.scitotenv.2020.140779'],
  ['Local Govts Localizing SDGs', '10.71064/spu.amjr.1.1.209'],
  ['Differentiated environmental contexts', '10.1016/j.jenvman.2024.120617'],
  ['Trade-offs sustainability viability', '10.1016/j.cities.2025.106368'],
  ['Benchmarking non-financial disclosure', '10.1080/01442872.2025.2560676'],
  ['Wellbeing gender budgeting SDGs', '10.1080/09540962.2021.1965402'],
];

(async () => {
  for (const [name, doi] of DOIS) {
    try {
      const w = await oa.getWorkByDOI(doi);
      const locs = (w.locations || []).filter(l => l.is_oa && (l.pdf_url || l.landing_page_url));
      console.log(`\n=== ${name} ===`);
      if (locs.length === 0) {
        console.log('  (no OA location)');
      } else {
        for (const l of locs) {
          console.log(`  [OA ${l.version || '?'}] pdf=${l.pdf_url || '-'} | land=${l.landing_page_url || '-'}`);
        }
      }
    } catch (e) {
      console.log(`\n=== ${name} === ✗ ${e.message}`);
    }
  }
})().catch(e => console.error(e.message));
