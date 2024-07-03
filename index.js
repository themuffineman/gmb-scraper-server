const puppeteer = require('puppeteer');
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');


const app = express();
const port = 8080;
app.use(cors({
    origin: '*'
}))
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let browser;
let server;
let wss;

// WebSocket server setup
const clients = new Map()
server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

wss = new WebSocket.Server({ server });
wss.on('connection', ws => {
    const id = uuidv4(); 
    clients.set(id, ws);
    ws.id = id; 
    broadcast(id, id, 'id')
    console.log('Client:', id, ' ,connected to WebSocket server');
    ws.on('close', () => {
        clients.delete(id)
        console.log('Client:', id, ' ,disconnected from WebSocket server');
    });
});

// Function to launch Puppeteer
async function launchPuppeteer() {
    try {
        browser = await puppeteer.launch();
        console.log('Puppeteer Up and Running');
    } catch (error) {
        console.error('Error launching Puppeteer:', error);
        throw error; // Re-throw the error to handle it elsewhere if needed
    }
}

// Launch Puppeteer when server starts
launchPuppeteer().catch(error => {
    console.error('Error launching Puppeteer:', error);
});

// Broadcast function for WebSocket
function broadcast(id, data, type) {
    const client = clients.get(id);
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type, data }))
    } else {
        console.error(`Client with ID ${id} not found or not open`);
    }
}
function closeClientConnection(id) {
    const client = clients.get(id);
    if (client) {
        client.close(); // Close the WebSocket connection
        clients.delete(id); // Remove client from the map
        console.log(`Client with ID ${id} has been disconnected`);
    } else {
        console.error(`Client with ID ${id} not found`);
    }
}


// Routes 
app.get('/scrape', async(req, res) => {

    const {service, location, pageNumber, clientId} = req.query
    try {

        if (service && location && pageNumber){
            console.log('The Scraping Queries:', service,',', location, ',', pageNumber, ' id:', clientId)
            const intPageNumber = parseInt(pageNumber)
            
            const page = await browser.newPage();
            page.setDefaultNavigationTimeout(900000); 
            page.setDefaultTimeout(900000);
        
            // Navigate to the GMB website
            if(intPageNumber === 0){
                await page.goto(`https://www.google.com/localservices/prolist?g2lbs=AIQllVxEpXuuCPFrOHRAavT6nJMeIXUuM9D7r7-IlczaiEuKdgYVA09lqC7MIhZ3mUJ_MfwMM30K5vDmEB9UFLvwoZMUuqe_RIT2RmrDlIhrFndV8WuAgW-ioANkhbKSz__jtHfxKrJZLfFak9ca1Vbqi4HEnaKw7Q%3D%3D&hl=en-US&gl=&cs=1&ssta=1&q=${service}+in+${location}&oq=${service}+in+${location}&scp=Cg5nY2lkOmFyY2hpdGVjdBJMEhIJSTKCCzZwQIYRPN4IGI8c6xYaEgkLNjLkhLXqVBFCt95Dkrk7HCIKVGV4YXMsIFVTQSoUDV1uZg8VcypvwB3BkMEVJTvOQ8gwABoKYXJjaGl0ZWN0cyITYXJjaGl0ZWN0cyBpbiB0ZXhhcyoJQXJjaGl0ZWN0&slp=MgA6HENoTUkxWXZoamNfVmhBTVZZSUJRQmgxMkpBRTRSAggCYACSAZsCCgsvZy8xdGg2ZjZ4ZwoNL2cvMTFoY3c1ZDltZAoLL2cvMXd5YzRybWQKDC9nLzEycWg5dzhmZAoNL2cvMTFnNm5sMGxmNQoLL2cvMXRkY2dzdjQKCy9nLzF0aGwxODBzCgsvZy8xdGc3c2RmNwoLL2cvMXRkNGR6cTEKCy9nLzF0ZnNuZDRfCg0vZy8xMWI3bHBtOGIxCgsvZy8xdHp6dng1bAoLL2cvMXRrNHJsMTEKCy9nLzF0a3ZiNGpzCg0vZy8xMWJ4OGNteHM4Cg0vZy8xMWNuMF93MTkxCgsvZy8xdG15NWdzaAoLL2cvMXYzaF9jM3EKCy9nLzF2eWsyeHpnCgsvZy8xdGZtY24xcRIEEgIIARIECgIIAZoBBgoCFxkQAA%3D%3D&src=2&serdesk=1&sa=X&ved=2ahUKEwiyo9uNz9WEAxUMQkEAHZWwBcEQjGp6BAgfEAE`);
                console.info('Navigated To GMB Website')
                broadcast(clientId, 'Setting  up scraper', 'status')
                const currentUrl = page.url();

                //Wait for input element and search
                await page.waitForSelector('input#qjZKOb.MDhB7');
                await page.$eval('input#qjZKOb.MDhB7', input => input.value = '');
                await page.type('input#qjZKOb.MDhB7', `${service} in ${location}`);
                await page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 10000));
                let exitLoop = false
                while(!exitLoop){
                    const newUrl = page.url();
                    if(newUrl !== currentUrl){
                        exitLoop=true
                    }else{
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
                const newUrl = page.url()
                await page.goto(newUrl)

                // Wait for cards to load
                await page.waitForSelector('div.rgnuSb.xYjf2e');
                await page.waitForSelector('.AIYI7d');
              
            
                // Get all the business cards
                const cards = await page.$$('div[jsname="gam5T"]');
    
                for (const card of cards) {
                    const businessName = await card.$eval('div.rgnuSb.xYjf2e', node => node.textContent);
                    const websiteATag = await card.$('a[aria-label="Website"]');
                    const url = websiteATag ? await (await websiteATag.getProperty('href')).jsonValue() : null;
            
                    if (url) {
                        const newPage = await browser.newPage();
                        newPage.setDefaultNavigationTimeout(900000);
                        newPage.setDefaultTimeout(900000);
                    
                        try {
                            await newPage.goto(url);
                            console.info(`Navigated to ${url}`);
                            broadcast(clientId, `Now scraping ${url}`, 'status');
    
        
                            let tempEmails = []
                            const crawledEmails = await crawl(newPage);
                            tempEmails.push(...crawledEmails)
        
                            const rootUrl = new URL(url).hostname.replace(/^www\./, '');
    
                            //data pre-processing
                            const anchorTags = await newPage.$$eval('a', anchors => anchors.map(anchor => anchor.href));
                            const filteredAnchorTags = [...new Set(anchorTags)]; // removing duplicates
                            const internalAnchorTags = filteredAnchorTags.filter((anchor)=> (anchor.includes(rootUrl))) // removing non root urls
                            const internalLinks = internalAnchorTags.filter(link => (link.includes('contact'))); // filtering down to contact links
                            
                            for (const link of internalLinks) {
                                await newPage.goto(link);
                                const secondaryCrawledEmails = await crawl(newPage);
                                tempEmails.push(...secondaryCrawledEmails);
                            }
                            
                            broadcast(clientId, JSON.stringify({ name: businessName, url, emails: [...new Set(tempEmails)]}), 'lead');
        
                        } catch (error) {
                            console.error(`Error navigating to ${url}: ${error}`);
                        } finally {
                            await newPage.close();
                        }
                    }  
                }
                console.log('Scraping Complete')
                res.status(200).send('Scraping complete');
            }
            else if(intPageNumber >= 1){
    
                await page.goto(`https://www.google.com/localservices/prolist?g2lbs=AIQllVxEpXuuCPFrOHRAavT6nJMeIXUuM9D7r7-IlczaiEuKdgYVA09lqC7MIhZ3mUJ_MfwMM30K5vDmEB9UFLvwoZMUuqe_RIT2RmrDlIhrFndV8WuAgW-ioANkhbKSz__jtHfxKrJZLfFak9ca1Vbqi4HEnaKw7Q%3D%3D&hl=en-US&gl=&cs=1&ssta=1&q=${service}+in+${location}&oq=${service}+in+${location}&scp=Cg5nY2lkOmFyY2hpdGVjdBJMEhIJSTKCCzZwQIYRPN4IGI8c6xYaEgkLNjLkhLXqVBFCt95Dkrk7HCIKVGV4YXMsIFVTQSoUDV1uZg8VcypvwB3BkMEVJTvOQ8gwABoKYXJjaGl0ZWN0cyITYXJjaGl0ZWN0cyBpbiB0ZXhhcyoJQXJjaGl0ZWN0&slp=MgA6HENoTUkxWXZoamNfVmhBTVZZSUJRQmgxMkpBRTRSAggCYACSAZsCCgsvZy8xdGg2ZjZ4ZwoNL2cvMTFoY3c1ZDltZAoLL2cvMXd5YzRybWQKDC9nLzEycWg5dzhmZAoNL2cvMTFnNm5sMGxmNQoLL2cvMXRkY2dzdjQKCy9nLzF0aGwxODBzCgsvZy8xdGc3c2RmNwoLL2cvMXRkNGR6cTEKCy9nLzF0ZnNuZDRfCg0vZy8xMWI3bHBtOGIxCgsvZy8xdHp6dng1bAoLL2cvMXRrNHJsMTEKCy9nLzF0a3ZiNGpzCg0vZy8xMWJ4OGNteHM4Cg0vZy8xMWNuMF93MTkxCgsvZy8xdG15NWdzaAoLL2cvMXYzaF9jM3EKCy9nLzF2eWsyeHpnCgsvZy8xdGZtY24xcRIEEgIIARIECgIIAZoBBgoCFxkQAA%3D%3D&src=2&serdesk=1&sa=X&ved=2ahUKEwiyo9uNz9WEAxUMQkEAHZWwBcEQjGp6BAgfEAE`);
                console.info(`Google GMB page ${intPageNumber} navigated`);
                broadcast(clientId, `Setting up scraper`, 'status');
                const currentUrl = page.url();

                
                //Wait for input element and search
                await page.waitForSelector('input#qjZKOb.MDhB7');
                await page.$eval('input#qjZKOb.MDhB7', input => input.value = '');
                await page.type('input#qjZKOb.MDhB7', `${service} in ${location}`);
                await page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 10000));
                let exitLoop = false
                while(!exitLoop){
                    const newUrl = page.url();
                    if(newUrl !== currentUrl){
                        exitLoop=true
                    }else{
                        await new Promise(resolve => setTimeout(resolve, 10000));
                    }
                }
                const newUrl = page.url();
                const editedUrl = newUrl + `&lci=${intPageNumber*20}`;
                await page.goto(editedUrl);
                
                await page.waitForSelector('div.rgnuSb.xYjf2e');
                await page.waitForSelector('.AIYI7d');
        
                // Wait for cards to load
                const cards = await page.$$('div[jsname="gam5T"]');
            
                for (const card of cards) {
                    const businessName = await card.$eval('div.rgnuSb.xYjf2e', node => node.textContent);
                    const websiteATag = await card.$('a[aria-label="Website"]');
                    const url = websiteATag ? await (await websiteATag.getProperty('href')).jsonValue() : null;
            
                    if (url) {
                        const newPage = await browser.newPage();
                        newPage.setDefaultNavigationTimeout(900000)
                        newPage.setDefaultTimeout(900000);
                    
                        try {
                            await newPage.goto(url);
                            console.info(`Navigated to ${url}`);
                            broadcast(clientId, `Scraping: ${url}`, 'status');
    
    
                            let tempEmails = []
                            const crawledEmails = await crawl(newPage);
                            tempEmails.push(...crawledEmails)
    
                            const rootUrl = new URL(url).hostname.replace(/^www\./, '');
    
                            // data pre-processing
                            const anchorTags = await newPage.$$eval('a', anchors => anchors.map(anchor => anchor.href));
                            const filteredAnchorTags = [...new Set(anchorTags)]; // removing duplicates
                            const internalAnchorTags = filteredAnchorTags.filter((anchor)=> (anchor.includes(rootUrl))) // removing non root urls
                            const internalLinks = internalAnchorTags.filter(link => (link.includes('contact'))); // filtering down to contact links

                            for (const link of internalLinks) {
                                await newPage.goto(link);
                                const secondaryCrawledEmails = await crawl(newPage);
                                tempEmails.push(...secondaryCrawledEmails);
                            }
                            
                            broadcast(clientId, JSON.stringify({ name: businessName, url, emails: [...new Set(tempEmails)]}), 'lead');    
                        } catch (error) {
                            console.error(`Error navigating to ${url}: ${error}`);
                        } finally {
                            await newPage.close();
                        }
                    }  
                } 
                res.status(200).send('Scraping complete');
                console.log('Scraping Complete')
                broadcast(clientId, `Finished Scraping`, 'status')
            }
            
        }
        
    }catch(error) { 
        console.error('Error:', error);
        broadcast(clientId, 'Error occurred: ' + error.message, 'status');
        res.status(500).send('Internal Server Error');
    }finally{
        await browser.close();
    }
        
    async function crawl(page) {
        const crawledEmails = [];
    
        // Extract all <a> tags on the page
        const links = await page.evaluate(() => {
            const anchorTags = Array.from(document.querySelectorAll('a'));
            return anchorTags.map(a => a.href);
        });
    
        const emailLinks = links.filter(link => link.startsWith('mailto:'));
    
        emailLinks.forEach(link => {
            const email = link.replace('mailto:', '');
            crawledEmails.push(email);
        });
    
        const text = await page.evaluate(() => document.body.textContent);
    
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    
        let match;
        while ((match = emailRegex.exec(text)) !== null) {
            crawledEmails.push(match[0]);
        }
    
        return crawledEmails;
    }
});

app.get('/cancel-process', (req, res) => {
    const {clientId} = req.query
    console.log('Received cancel-process request. Cleaning up...');

    closeClientConnection(clientId)
    res.send('Process cancellation initiated');
});








