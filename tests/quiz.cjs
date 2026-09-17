const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        // Tests exercise the offline document without relying on third-party CDNs.
        await page.route('https://**/*', route => route.abort());
        await page.addInitScript(() => { window.tailwind = {}; });
        await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
        const coverage = await page.evaluate(() => {
            let count = 0;
            for (const group of verbData) for (const verb of group.verbs) {
                for (const type of Object.keys(formLabels)) for (let repeat = 0; repeat < 20; repeat++) {
                    const options = makeChoiceOptions(verb, type);
                    const valid = Object.keys(formLabels).flatMap(key => verb[key].split('/'));
                    if (options.length !== 4 || new Set(options).size !== 4 || options.filter(x => x === verb[type]).length !== 1) {
                        throw new Error(`Invalid choices: ${verb.infinitive}/${type}`);
                    }
                    if (options.some(x => x !== verb[type] && (valid.includes(x) || acceptedVariants.includes(x)))) {
                        throw new Error(`Valid form used as distractor: ${verb.infinitive}/${type}`);
                    }
                    count++;
                }
            }
            window.spokenAnswers = [];
            speak = value => window.spokenAnswers.push(value);
            return count;
        });
        await page.click('#tab-quiz');
        await page.check('input[value="choice"]');
        await page.uncheck('#form-selector input[value="infinitive"]');
        await page.uncheck('#form-selector input[value="presentParticiple"]');
        await page.click('#start-game-btn');
        assert.equal(await page.locator('#choice-options button').count(), 4);
        assert.equal(await page.locator('#answer-input').isVisible(), false);
        assert.equal(await page.locator('#submit-btn').isVisible(), false);
        assert.equal(await page.evaluate(() => window.spokenAnswers.length), 0);
        const seen = await page.evaluate(() => {
            const types = new Set();
            for (let i = 0; i < 100; i++) {
                generateQuestion();
                types.add(currentQuestion.type);
                if (!['pastSimple', 'pastParticiple'].includes(currentQuestion.type)) throw Error('Unselected form');
                if (!document.getElementById('question-text').textContent.includes(currentQuestion.verb.infinitive)) throw Error('Missing root');
            }
            return [...types];
        });
        assert.equal(seen.length, 2);
        await page.evaluate(() => {
            [...choiceOptions.children].find(button => button.dataset.answer === currentQuestion.answer).click();
        });
        assert.equal(await page.locator('#score').textContent(), '10');
        assert.equal(await page.locator('#correct-count').textContent(), '1');
        assert.equal(await page.locator('#choice-options button:disabled').count(), 4);
        assert.match(await page.locator('#feedback-container').textContent(), /原形 → 過去式 → 過去分詞/);
        await page.evaluate(() => checkAnswer(currentQuestion.answer));
        assert.equal(await page.locator('#score').textContent(), '10');
        await page.locator('#next-question-btn').press('Enter');
        assert.equal(await page.locator('#choice-options button:disabled').count(), 0);
        await page.evaluate(() => {
            [...choiceOptions.children].find(button => button.dataset.answer !== currentQuestion.answer).focus();
        });
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#wrong-count').textContent(), '1');
        assert.equal(await page.locator('#streak').textContent(), '0');
        assert.equal(await page.locator('.answer-choice.is-correct').count(), 1);
        assert.equal(await page.locator('.answer-choice.is-wrong').count(), 1);
        await page.click('#back-to-lobby-btn');
        await page.uncheck('#form-selector input[value="pastParticiple"]');
        await page.click('#start-game-btn');
        await page.evaluate(() => {
            for (let i = 0; i < 50; i++) {
                generateQuestion();
                if (currentQuestion.type !== 'pastSimple') throw Error('Past-only filter failed');
            }
        });
        await page.setViewportSize({ width: 375, height: 812 });
        assert.equal(await page.locator('#choice-options').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1);
        await page.click('#back-to-lobby-btn');
        await page.check('input[value="spelling"]');
        await page.click('#start-game-btn');
        assert.equal(await page.locator('#answer-input').isVisible(), true);
        assert.equal(await page.locator('#choice-options').isVisible(), false);
        await page.locator('#answer-input').fill(await page.evaluate(() => currentQuestion.answer));
        await page.locator('#answer-input').press('Enter');
        assert.equal(await page.locator('#score').textContent(), '10');
        assert.equal(await page.locator('#correct-count').textContent(), '1');
        assert.deepEqual(errors, []);
        console.log(`PASS: ${coverage} option sets; mixed/past-only filters; correct/wrong answers; repeat guard; keyboard; mobile layout; spelling regression.`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
