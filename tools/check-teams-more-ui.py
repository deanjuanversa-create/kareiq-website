# Checks the screens of the last round of the team dashboards in a real browser.
# Needs a fresh demo server:  APP_DEMO=true node server.js   then:   python3 tools/check-teams-more-ui.py http://localhost:3000
# Every new page opens for its role on a laptop and a phone (no page errors, nothing wider than the screen),
# and the main actions work from the screen: a supplier bill, a salary, a supply movement, a pipeline move,
# and a message template.
import asyncio, sys
from playwright.async_api import async_playwright

B = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000').rstrip('/')
P = F = 0
def ok(c, m):
    global P, F
    if c: P += 1; print('PASS ', m)
    else: F += 1; print('FAIL ', m)

PAGES = {
    'finance': ['fin/renewals', 'fin/bills', 'fin/export'],
    'hr': ['hr/payslips', 'hr/salaries', 'hr/exits', 'hr/recruitment', 'hr/reviews', 'me'],
    'ops': ['ops/suggestions', 'ops/supplies', 'ops/visit-times'],
    'sales': ['sales/pipeline', 'sales/templates', 'sales/commission'],
    'admin': ['fin/bills', 'hr/payslips', 'ops/supplies', 'sales/pipeline'],
}
WIDE = "() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"

async def signin(b, who, w=1440, h=900, code=None):
    ctx = await b.new_context(viewport={'width': w, 'height': h})
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(B + '/app/#/signin'); await pg.wait_for_timeout(500)
    await pg.fill('input[name=id]', who + '@demo.kareiq'); await pg.fill('input[name=password]', 'demo-pass-123')
    await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1800)
    return ctx, pg, errs

async def dialog_submit(pg):
    await pg.click('dialog[open] [data-act=submit-dialog]'); await pg.wait_for_timeout(1300)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # every new page, laptop and phone
        for who, pages in PAGES.items():
            for w in (1440, 390):
                ctx, pg, errs = await signin(b, who, w)
                for pa in pages:
                    await pg.goto(B + '/app/#/office/' + pa); await pg.wait_for_timeout(1300)
                    h1 = await pg.text_content('#mn h1') or ''
                    ok(h1 and not errs and not await pg.evaluate(WIDE), f'{who} {w}px: {pa} opens ("{h1.strip()}"), no errors, nothing too wide')
                    errs.clear()
                await ctx.close()
        # menus: each role sees its new pages
        for who, links in {'finance': ['fin/renewals', 'fin/bills', 'fin/export'], 'hr': ['hr/payslips', 'hr/exits', 'hr/recruitment', 'hr/reviews'], 'ops': ['ops/suggestions', 'ops/supplies', 'ops/visit-times'], 'sales': ['sales/pipeline', 'sales/templates', 'sales/commission'], 'admin': ['fin/bills', 'hr/payslips', 'sales/pipeline']}.items():
            ctx, pg, errs = await signin(b, who)
            hrefs = await pg.eval_on_selector_all('.sb a', 'as => as.map(a => a.getAttribute("href"))')
            ok(all(('#/office/' + l) in hrefs for l in links), who + ': the new pages are in the menu')
            await ctx.close()

        # finance: a supplier bill from the screen, then a payment
        ctx, pg, errs = await signin(b, 'finance')
        await pg.goto(B + '/app/#/office/fin/bills'); await pg.wait_for_timeout(1200)
        await pg.click('[data-act=o-bill-new]'); await pg.wait_for_timeout(300)
        await pg.fill('dialog[open] [name=vendor]', 'UI Medical Traders'); await pg.fill('dialog[open] [name=billNo]', 'UI-7'); await pg.fill('dialog[open] [name=amount]', '1200')
        await pg.select_option('dialog[open] [name=category]', 'supplies'); await dialog_submit(pg)
        ok(await pg.locator('text=UI Medical Traders').count() == 1, 'finance adds a supplier bill on the screen')
        await pg.click('tr:has-text("UI Medical Traders") [data-act=o-bill-pay]'); await pg.wait_for_timeout(300)
        await dialog_submit(pg)
        ok(await pg.locator('tr:has-text("UI Medical Traders") .tpill.good').count() == 1, 'paying the full amount marks it paid')
        await pg.goto(B + '/app/#/office/fin/export'); await pg.wait_for_timeout(1200)
        ok(await pg.locator('a[href*="format=tally"]').count() == 1 and await pg.locator('.tpill:has-text("Creditor - UI Medical Traders")').count() == 1, 'the export lists the supplier ledger and offers the Tally file')
        ok(not errs, 'finance: no page errors'); await ctx.close()

        # hr: a salary from the screen; the payslip draft appears
        ctx, pg, errs = await signin(b, 'hr')
        await pg.goto(B + '/app/#/office/hr/salaries'); await pg.wait_for_timeout(1200)
        await pg.click('tr:has-text("Nurse Anjali") [data-act=o-sal]'); await pg.wait_for_timeout(300)
        await pg.fill('dialog[open] [name=e_basic]', '20000'); await pg.fill('dialog[open] [name=e_hra]', '5000'); await pg.fill('dialog[open] [name=d_pt]', '200')
        await dialog_submit(pg)
        ok(await pg.locator('tr:has-text("Nurse Anjali") >> text=₹24,800').count() == 1, 'hr sets a salary: net ₹24,800 shown')
        await pg.goto(B + '/app/#/office/hr/payslips'); await pg.wait_for_timeout(1300)
        ok(await pg.locator('tr:has-text("Nurse Anjali") input[name^=lop_]').count() == 1 and await pg.locator('button:has-text("Issue the ticked payslips")').count() == 1, 'the payslip is ready to issue, with its loss-of-pay days')
        await pg.goto(B + '/app/#/office/hr/recruitment'); await pg.wait_for_timeout(1000)
        await pg.click('[data-act=o-cand-new]'); await pg.wait_for_timeout(300)
        await pg.fill('dialog[open] [name=name]', 'UI Candidate'); await pg.fill('dialog[open] [name=phone]', '9800166661'); await pg.select_option('dialog[open] [name=source]', 'referral')
        await dialog_submit(pg)
        ok(await pg.locator('text=UI Candidate').count() >= 1, 'hr adds a candidate on the screen')
        ok(not errs, 'hr: no page errors'); await ctx.close()

        # operations: a supply from the screen, then issuing it
        ctx, pg, errs = await signin(b, 'ops')
        await pg.goto(B + '/app/#/office/ops/supplies'); await pg.wait_for_timeout(1200)
        await pg.click('[data-act=o-sup-new]'); await pg.wait_for_timeout(300)
        await pg.fill('dialog[open] [name=name]', 'UI Gloves'); await pg.fill('dialog[open] [name=opening]', '20'); await pg.fill('dialog[open] [name=reorderLevel]', '10')
        await dialog_submit(pg)
        await pg.click('tr:has-text("UI Gloves") [data-k=issued]'); await pg.wait_for_timeout(300)
        await pg.fill('dialog[open] [name=qty]', '12'); await dialog_submit(pg)
        ok(await pg.locator('tr:has-text("UI Gloves") .tpill.warn:has-text("Low")').count() == 1, 'operations adds a supply and issues it: shown as low')
        ok(not errs, 'operations: no page errors'); await ctx.close()

        # sales: a template, and moving a card on the pipeline
        ctx, pg, errs = await signin(b, 'sales')
        await pg.goto(B + '/app/#/office/sales/templates'); await pg.wait_for_timeout(1000)
        await pg.click('[data-act=o-tpl]'); await pg.wait_for_timeout(300)
        await pg.fill('dialog[open] [name=name]', 'UI first reply'); await dialog_submit(pg)
        ok(await pg.locator('h2:has-text("UI first reply")').count() == 1, 'sales saves a message template')
        await pg.goto(B + '/app/#/office/sales/pipeline'); await pg.wait_for_timeout(1300)
        card = pg.locator('.kcol.new .kcard').first
        name = (await card.locator('.kopen b').text_content()).strip()
        await card.locator('select').select_option('contacted'); await pg.wait_for_timeout(1500)
        ok(await pg.locator('.kcol.contacted .kcard:has-text("' + name + '")').count() >= 1, 'moving a card to Contacted moves the lead')
        btn = pg.locator('.kcard [data-act=o-msg]').first
        if await btn.count():
            await btn.click(); await pg.wait_for_timeout(1500)
            ok(await pg.locator('dialog[open] textarea[name=text]').count() == 1, 'the Message button fills a template for the lead')
            await pg.click('dialog[open] [data-act=close]')
        ok(not errs, 'sales: no page errors'); await ctx.close()

        await b.close()
    print(('ALL PASSED  ' if not F else '') + f'check-teams-more-ui: PASS {P} FAIL {F}')
    sys.exit(1 if F else 0)

asyncio.run(main())
