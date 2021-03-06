const puppeteer = require('puppeteer');
const fs = require('fs');
const https = require('https');
const videoUrlLink = require('video-url-link');
const prompts = require('prompts');

(async () => {
    console.log('Puppeteer Tweet Saver 1.2');
    console.log('Author: Nakateru(2021.12.24)');

    //input URL
    const inputted = await prompts({
        type: 'text',
        name: 'url',
        message: 'Please Input Tweet URL:'
    });
    const twiUrl = inputted.url;

    console.time('Processing time');

    //analyze url and get user name , tweet Id
    const urlInfo = analyzeUrl(twiUrl);
    const userName = urlInfo[0];
    const twiId = urlInfo[1];
    console.log('User Name: ' + userName);
    console.log('Tweet Id: ' + twiId);

    //open	browser
    const browser = await puppeteer.launch({
        headless: true,
        ignoreHTTPSErrors: true,
        args: ['--lang=ja'],
        defaultViewport: {width: 800, height: 600}
    });

    const page = await browser.newPage();
    await page.goto(twiUrl, {
        waitUntil: 'load',
        timeout: 0
    });

    //save tweet
    await saveTweet(page, twiUrl);
    await browser.close();
    console.timeEnd('Processing time');
    console.log('Done!');

    //----------Function--------------------
    //analyze url function
    function analyzeUrl(url) {
        try {
            const re = url.match(/https:\/\/twitter.com\/(?<userName>[a-zA-Z0-9_]{1,15})\/status\/(?<twiId>\d+)/);
            if (re !== null) {
                return [re.groups.userName, re.groups.twiId];
            } else {
                console.log('Error URL');
                process.exit();
            }
        } catch {
            console.log('Error URL');
            process.exit();
        }
    }

    //is element existed function
    async function isEleExist(page, e) {
        const res = await page.$(e);
        return res !== null;
    }

    //create directory function
    function mkdirFun(path) {
        const isExists = fs.existsSync(path);
        if (!isExists) {
            try {
                fs.mkdirSync(path, {recursive: true});
                console.log('Created Folder ' + path);
            } catch {
                console.log('Created Folder Failed');
                process.exit();
            }
        } else {
            console.log('Directory Existed!');
        }
    }

    //save images or video function
    function saveMedia(path, mediaUrl) {
        https.get(mediaUrl, res => {
            //console.log(res.headers);
            //get media type
            const contentType = res.headers['content-type'];
            //console.log(contentType);
            var mediaType = '.jpg';
            if (contentType === 'image/jpeg') {
                mediaType = '.jpg';
            } else if (contentType === 'image/gif') {
                mediaType = '.gif';
            } else if (contentType === 'image/png') {
                mediaType = '.png';
            } else if (contentType === 'video/mp4') {
                mediaType = '.mp4';
            }
            //set file name
            const mediaName = path + mediaType;
            //write file
            const stream = fs.createWriteStream(mediaName);
            res.pipe(stream);
            stream.on('finish', () => {
                stream.close();
                console.log('saved ' + mediaName);
            });

        });
    }

    //set file name function
    function setName(t) {
        const re = t.match(/(?<ampm>[??????$])(?<hour>\d+):(?<min>\d+) ?? (?<year>\d+)???(?<month>\d+)???(?<day>\d+)???/);
        const y = re.groups.year;
        const mo = re.groups.month;
        const d = re.groups.day;
        const h = re.groups.ampm === '???' ? '0' + re.groups.hour : parseInt(re.groups.hour) + 12;
        const mi = re.groups.min;
        return y + '-' + mo + '-' + d + ' ' + h + mi;
    }

    //save tweet function
    async function saveTweet(page, twiUrl) {
        //wait for opening page
        //load until <a> tag which is the parent of tweet time <span> tag, is visable
        await page.waitForSelector('a[href="/' + userName + '/status/' + twiId + '"]', {visible: true});

        //if contains sensitive content, click to show it
        const sensitive = await page.$x('//a[@href="/settings/content_you_see"]/ancestor::div[2]/following-sibling::div/descendant::div[2]/descendant::span[2]');
        //console.log(sensitive.length);
        if (sensitive.length !== 0) {
            await sensitive[0].click();
        }

        //tweet time
        const timeText = await page.$eval('a[href="/' + userName + '/status/' + twiId + '"] > span', el => el.textContent);
        console.log('Tweet time: ' + timeText);

        //namae (account name)
        const namae = await page.$eval('a[href="/' + userName + '"] > div > div > div > span > span', el => el.textContent);
        console.log('Namae: ' + namae);

        //find image on the tweet
        var imgArr = [];
        const imgEle = await page.$x('//a[contains(@href,"' + '/' + userName + '/status/' + twiId + '/photo")]');
        // console.log(imgEle);

        //if an image tweet
        if (imgEle.length > 0) {
            console.log('Found ' + imgEle.length + ' image(s) on this tweet')

            //push all image url into imgArr
            await Promise.all(imgEle.map(async (e) => {
                const res = await e.$eval('img', x => x.getAttribute("src"));
                //select large size
                imgArr.push(res.split('?')[0] + '?format=jpg&name=large');
            }));
            // console.log(imgArr);

            //set path name and creat folder
            var pathName = namae + '(@' + userName + ')_Twitter';
            pathName = pathName.replace(/[\\:*?"<>|/]/g, "");
            mkdirFun(pathName);

            //set image file name
            const fileName = setName(timeText);
            var num = 1;

            //save image file
            await imgArr.map(x => {
                saveMedia(pathName + '/' + fileName + ' ' + num, x);
                num++;
            });

            //if a video tweet
        } else if (await isEleExist(page, 'div[data-testid="videoPlayer"]')) {
            console.log('Found a video on this tweet');

            videoUrlLink.twitter.getInfo(twiUrl, {}, (error, info) => {
                if (error) {
                    console.error(error);
                } else {
                    //console.log(info.full_text);

                    //select best bitrate
                    info.variants = info.variants.filter(x => x.content_type === 'video/mp4');
                    info.variants.sort((a, b) => b.bitrate - a.bitrate);
                    const videoUrl = info.variants[0].url.replace('?tag=12', '');
                    //console.log(info.variants);
                    console.log('video URL: ' + videoUrl);

                    //set path name and creat folder
                    var pathName = namae + '(@' + userName + ')_Twitter';
                    pathName = pathName.replace(/[\\:*?"<>|/]/g, "");
                    mkdirFun(pathName);

                    //set image file name
                    const fileName = setName(timeText);

                    //save video file
                    saveMedia(pathName + '/' + fileName, videoUrl);
                }
            });
            //if no image or video
        } else {
            console.log('No image or video Found on this tweet');
        }
    }

})();
