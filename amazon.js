const puppeteer = require('puppeteer');

async function getProductData(){
    const browser = await puppeteer.launch({ 
        headless: false, 
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.info('puppeteer loaded')
    const page = await browser.newPage()
    page.setDefaultNavigationTimeout(900000); 
    page.setDefaultTimeout(900000);
    page.setViewport({
        width: 1024,
        height: 780
    })
    console.info('newPage opened')  
    await page.goto('https://www.amazon.com/stores/Fluval/Homepage/page/9852117C-B973-4487-8170-6A1CBAA3512A')
    await page.waitForSelector('ul.ProductGrid__grid__f5oba')
    console.info('Page loaded')
    await page.waitForSelector('li.ProductGridItem__itemOuter__KUtvv ProductGridItem__grid-tapestry__D0bpE ProductGridItem__fixed__DQzmO')
    console.info('List loaded')
    const scrapedData = await page.$$eval('li.ProductGridItem__itemOuter__KUtvv ProductGridItem__grid-tapestry__D0bpE ProductGridItem__fixed__DQzmO',  (li)=>{
        console.info('list item found')
        const results = li.map((item)=>{
        const productName = item.querySelector('a[data-testid="product-grid-title"]').innerText.trim();
        const productPrice = item.querySelector('div[data-testid="grid-item-buy-price"]').innerText.trim();
        const productImage = item.querySelector('img').src
        const src = item.querySelector('a').href
        console.info({name: productName, price: productPrice, image: productImage, url: src})
        return {name: productName, price: productPrice, image: productImage, url: src}
        })
        return results;
    })
    const finalOutput = []
    for (const product of scrapedData){
        const currentDate = new Date();
        const brand = 'Fluval'
        const retailer = 'Amazon'
        await page.goto(product.url)
        await page.waitForSelector('table#productDetails_detailBullets_sections1')
        console.info('Product Page Loaded')
        const ASIN = await page.$eval('#productDetails_detailBullets_sections1 tr:has(th:contains("ASIN"))', (table)=>{
        return table.querySelector('td').innerText.trim()
        })
        finalOutput.push({...product, brand, dateAccessed: currentDate, retailer, ASIN})
    }

  console.log(finalOutput)
}

getProductData()