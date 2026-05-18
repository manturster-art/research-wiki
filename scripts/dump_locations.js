// dump_locations.js — print all OA mirror URLs for given W-IDs
const oa = require('./openalex_helper');
const ids = process.argv.slice(2);
(async () => {
  for (const id of ids) {
    const w = await oa.getWork(id);
    console.log(`\n===== ${id} : ${w.display_name?.slice(0,70)} =====`);
    console.log(`primary oa_url: ${w.open_access?.oa_url}`);
    if (w.locations) {
      for (const loc of w.locations) {
        console.log(`  is_oa=${loc.is_oa} ver=${loc.version || '-'} pdf=${loc.pdf_url || '-'} land=${loc.landing_page_url || '-'}`);
      }
    }
  }
})().catch(e => console.error(e.message));
