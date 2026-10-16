import asyncio, base64, sys, json
from playwright.async_api import async_playwright
PDF = "https://old.supremecourt.mv/storage/mv/sc-ninmunthah/hukum/2026sc37-2023sca13-aishath-aniya-v-contech-pvt-ltd.pdf"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=False, args=["--disable-blink-features=AutomationControlled"])
        ctx = await b.new_context(locale="en-US", viewport={"width":1280,"height":900},
              user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        await ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
        pg = await ctx.new_page()
        await pg.goto("https://old.supremecourt.mv/", wait_until="domcontentloaded", timeout=60000)
        for i in range(30):
            t = await pg.title()
            print("title", i, t, flush=True)
            if "moment" not in t.lower(): break
            await pg.wait_for_timeout(2000)
        await pg.screenshot(path="out/old_home.png")
        res = await pg.evaluate("""async (u) => { const r = await fetch(u, {credentials:'include'});
            const b = new Uint8Array(await r.arrayBuffer()); let s=''; for (let i=0;i<b.length;i+=32768) s+=String.fromCharCode(...b.subarray(i,i+32768));
            return {status:r.status, type:r.headers.get('content-type'), b64:btoa(s)}; }""", PDF)
        print("fetch", res["status"], res["type"], len(res["b64"]))
        open("out/b.pdf","wb").write(base64.b64decode(res["b64"]))
        print(json.dumps(await ctx.cookies())[:600])
        await b.close()
asyncio.run(main())
