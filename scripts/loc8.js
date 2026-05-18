const oa = require('./openalex_helper');
const DOIS = [
  ['vinuesa', '10.1038/s41467-019-14108-y'],
  ['kroll', '10.1057/s41599-019-0335-5'],
  ['nilsson-2016', '10.1038/534320a'],
  ['nilsson-2018', '10.1007/s11625-018-0604-z'],
  ['varma', '10.1186/1471-2105-7-91'],
  ['tosun', '10.1002/gch2.201700036'],
  ['pradhan', '10.1002/2017EF000632'],
  ['bonina', '10.1111/isj.12326'],
];
(async () => {
  for (const [name, doi] of DOIS) {
    try {
      const w = await oa.getWorkByDOI(doi);
      console.log(`\n=== ${name} ===`);
      for (const l of (w.locations || [])) {
        if (l.is_oa && (l.pdf_url || l.landing_page_url)) {
          console.log(`  [OA ${l.version||'?'}] pdf=${l.pdf_url||'-'} land=${l.landing_page_url||'-'}`);
        }
      }
    } catch (e) { console.log(`\n=== ${name} === ✗ ${e.message}`); }
  }
})().catch(e => console.error(e.message));
