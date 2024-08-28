import axios from 'axios'
import * as cheerio from 'cheerio'
import emailValidator from 'deep-email-validator'
import { config } from 'dotenv'
import OpenAI from "openai";
config()

export default class Prometheus{
    constructor(url) {
        this.url = url;
    }
    async getEmails(){
        const emails = []
        
        try {
            const initialemails = await getEmailsSinglePage(this.url)
            emails.push(...initialemails)
            const links = await getInternalLinks(this.url)
    
            for (const link of links){
                const returnedEmails = await getEmailsSinglePage(link)
                for (const email of returnedEmails){
                    const isValid = await verifyEmail(email)
                    if(isValid.isValid){
                        emails.push(email)
                    }else{
                        continue
                    }
                }
            }
            const uniqueEmails = emails.filter((value, index, self) =>
                index === self.findIndex((t) => t.toLowerCase() === value.toLowerCase())
            );
    
            return uniqueEmails
        } catch (error) {
            return []
        }
        async function getInternalLinks(url) {
            try {
                const { data: html } = await axios.get(url);
                const $ = cheerio.load(html); 
                const baseUrl = getRootDomain(url)
                const internalLinks = [];
        
                $('a').each((i, elem) => {
                    try {
                        const href = $(elem).attr('href')
                        if(href){
                            if (href.includes(baseUrl)){
                                internalLinks.push(href);
                            }
                        }
                    } catch(error) {
                        return
                    }
                })
        
                return internalLinks
            } catch (error){
                return []
            }
            function getRootDomain(url){
                const parsedUrl = new URL(url);
                const domain = parsedUrl.hostname;
                return domain;
            }
        }
        async function getEmailsSinglePage(url) {
            const emails = [];
            const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+/g;
        
            try {
                const { data: html } = await axios.get(url);
                const $ = cheerio.load(html);
        
                // Extract emails from text content in the body
                const textContent = $('body').text();
                const matchedEmails = textContent.match(emailRegex);
                if (matchedEmails) {
                    emails.push(...matchedEmails);
                }
        
                // Extract emails from href attributes of a tags
                $('a[href^="mailto:"]').each((_, element) => {
                    const href = $(element).attr('href');
                    const email = href.replace(/^mailto:/, ''); // Remove the mailto: part
                    emails.push(email);
                });
        
                return emails;
            } catch (error) {
                return [];
            }
        }
        async function verifyEmail(email) {
            const validity = await emailValidator.validate(email) // make sure to add IP roatation
            return {
                isValid: validity.valid,
                reason: validity.reason || null
            }
        }
    }
    async getSocialLinks(){
        //NOTE: only scrapes the first page
        const twitterRegex = /https?:\/\/(www\.)?twitter\.com\/[A-Za-z0-9_]+/g
        const facebookRegex = /https?:\/\/(www\.)?facebook\.com\/[A-Za-z0-9.]+/g
        const linkedinRegex = /https?:\/\/(www\.)?linkedin\.com\/in\/[A-Za-z0-9-]+/g
        const instagramRegex = /https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+/g
        const youtubeRegex = /https?:\/\/(www\.)?(youtube\.com\/(channel|c|user|watch\?v=)|youtu\.be\/)[A-Za-z0-9_\-]+/g
    
        try {
            const { data: html } = await axios.get(this.url)
            const $ = cheerio.load(html);        
            const textContent = $('body').text()
            const twitterLinks = textContent.match(twitterRegex);
            const facebookLinks = textContent.match(facebookRegex);
            const linkedinLinks = textContent.match(linkedinRegex);
            const instagramLinks = textContent.match(instagramRegex);
            const youtubeLinks = textContent.match(youtubeRegex)
    
            return {
                twitter: twitterLinks,
                facebook: facebookLinks,
                linkedin: linkedinLinks,
                instagram: instagramLinks,
                youtube: youtubeLinks
            }
        } catch (error) {
            return {}
        }
    
    }
    async getPagePeformance(){
        try{
            const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${this.url}&key=${process.env.PAGE_SPEED_API}`)
            if(!res.ok){
                throw new Error('Fetch Error')
            }
            const performanceData = await res.json()
            const diagnostics = Object.values(performanceData.lighthouseResult?.audits)
            .filter(audit => audit.details && audit.details.type === 'diagnostic')
            .map(diagnostic => ({
                title: diagnostic.title,
                description: diagnostic.description
            }));
    
    
            return {
                tti: performanceData.lighthouseResult.audits.interactive.displayValue, // The time it takes for the page to become fully interactive, where the page has loaded and is ready to respond to user inputs.
                speed: performanceData.lighthouseResult.audits['speed-index'].displayValue, // How quickly the content of a page is visibly populated.
                diagnostics: diagnostics
            }
        }catch(err){
            return {error: err.message}
        }
    }
    async adsUsed(){
        try {
            const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
            const { data } = await axios.get(this.url)
            const $ = cheerio.load(data);
            const headerContent = $('header').map((i, el) => $(el).html()).get();
            const scriptContent = $('script').map((i, el) => $(el).html()).get();
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {role: "system", content: "You are an expert at structured data extraction and determining the ads run by a website. You will be given raw website html text data and you should extract the ads the website is running on the site by looking for their signatures in the data. For example but no limited to google, facebook, pinterest, twitter, reddit etc. Return the extracted data following the given structure"},
                    { role: "user", content: `Here is the Header Content: ${headerContent}. Here is the Script Content: ${scriptContent}` },
                ],
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "text_extraction",
                        schema: {
                            type: "object",
                            properties: {
                                ads: {
                                    type: "array",
                                    items: { type: "string" }
                                }
                            },
                            required: ["ads"],
                            additionalProperties: false
                        },
                        strict: true
                    }
                }
            });
            const ads = JSON.parse(completion.choices[0].message.content)
            return ads.ads
            
        } catch (error) {
            return []
        }
    }
    async techStack(){
        try {
            const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
            const { data } = await axios.get(this.url)
            const $ = cheerio.load(data);
            const headerContent = $('header').map((i, el) => $(el).html()).get();
            const scriptContent = $('script').map((i, el) => $(el).html()).get();
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {role: "system", content: "You are an expert at structured data extraction and determining the tech stack used by a website. You will be given raw website html text data and you should extract the tech stack the website is using by looking for their signatures in the data. For example but no limited to react, vue, woocomerce, wordpress, shopify, squarespace etc. Return the extracted data following the given structure"},
                    { role: "user", content: `Here is the Header Content: ${headerContent}. Here is the Script Content: ${scriptContent}` },
                ],
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "text_extraction",
                        schema: {
                            type: "object",
                            properties: {
                                stacks: {
                                    type: "array",
                                    items: { type: "string" }
                                }
                            },
                            required: ["stacks"],
                            additionalProperties: false
                        },
                        strict: true
                    }
                }
            });
            const techStack = JSON.parse(completion.choices[0].message.content)
            return techStack.stacks
            
        } catch (error) {
            return []
        }
    }
}
