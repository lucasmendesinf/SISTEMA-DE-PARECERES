const { chromium, devices } = require('playwright');
const path = require('path');
(async()=>{
  const browser = await chromium.launch({ headless: true });
  for (const [label, opts] of [['desktop',{viewport:{width:1440,height:900}}], ['mobile',{...devices['Pixel 7']}]] ) {
    const context = await browser.newContext(opts);
    const page = await context.newPage();
    page.on('console', msg => console.log(label, 'CONSOLE', msg.type(), msg.text()));
    page.on('requestfailed', req => console.log(label, 'REQUESTFAILED', req.method(), req.url(), req.failure()?.errorText));
    const resp = await page.goto('https://aiprof.calutec.com.br/login.php', {waitUntil:'domcontentloaded', timeout:30000}).catch(e => { console.log(label, 'GOTOERR', e.message); return null; });
    await page.waitForTimeout(3000);
    console.log(label, 'URL', page.url(), 'status', resp && resp.status());
    console.log(label, 'title', await page.title().catch(e=>'ERR '+e.message));
    console.log(label, 'body', (await page.locator('body').innerText().catch(e=>'ERR '+e.message)).slice(0,2000).replace(/\s+/g,' '));
    console.log(label, 'inputs', await page.locator('input,button,a').evaluateAll(els => els.map((el,i)=>({i,tag:el.tagName,type:el.type||'',name:el.name||'',id:el.id||'',text:(el.innerText||el.value||el.placeholder||el.textContent||'').trim(), href:el.href||''}))).catch(e=>'ERR '+e.message));
    const shot = path.resolve('.tmp-tests', label+'-prelogin.png');
    await page.screenshot({path:shot, fullPage:true}).catch(e=>console.log(label,'shot err',e.message));
    console.log(label, 'screenshot', shot);
    await context.close();
  }
  await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
