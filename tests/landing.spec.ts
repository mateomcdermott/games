import { test, expect, Page } from '@playwright/test';
import path from 'path';

const FILE_URL =
    'file:///' +
    path.join(__dirname, '..', 'index.html').replace(/\\/g, '/').replace(/ /g, '%20');

async function loadPage(page: Page) {
    await page.goto(FILE_URL);
    await page.waitForSelector('#intro-overlay', { state: 'visible' });
    await page.click('#intro-overlay');
    await page.waitForSelector('#intro-overlay', { state: 'hidden' });
}

async function addPlayer(page: Page, name: string) {
    await page.fill('#playerName', name);
    await page.click('#addPlayerBtn');
}

/** Bypasses the input's maxlength="7" attribute for negative-case tests. */
async function addPlayerRaw(page: Page, name: string) {
    await page.evaluate((n: string) => {
        (document.getElementById('playerName') as HTMLInputElement).value = n;
    }, name);
    await page.click('#addPlayerBtn');
}

// ============================================================
// LANDING PAGE — PLAYER MANAGEMENT
// ============================================================
test.describe('Landing Page — Player Management', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page);
    });

    // --- POSITIVE ---

    test('adds a player with a valid name', async ({ page }) => {
        await addPlayer(page, 'Alice');
        // addPlayer calls .toUpperCase() — name stored and displayed as 'ALICE'
        // li text = "1. ALICE" + remove button "X" = "1. ALICEX"
        await expect(page.locator('#playerList li')).toHaveCount(1);
        await expect(page.locator('#playerList li span').first()).toContainText('ALICE');
    });

    test('adds multiple distinct players', async ({ page }) => {
        await addPlayer(page, 'Alice');
        await addPlayer(page, 'Bob');
        await addPlayer(page, 'Carol');
        await expect(page.locator('#playerList li')).toHaveCount(3);
    });

    test('adds player by pressing Enter key', async ({ page }) => {
        await page.fill('#playerName', 'Carol');
        await page.keyboard.press('Enter');
        await expect(page.locator('#playerList li')).toHaveCount(1);
        await expect(page.locator('#playerList li span').first()).toContainText('CAROL');
    });

    test('adds player with exactly 7 characters (max allowed)', async ({ page }) => {
        await addPlayer(page, 'Exactly'); // 7 chars
        await expect(page.locator('#playerList li')).toHaveCount(1);
        await expect(page.locator('#playerError')).toHaveText('');
    });

    test('removes a player from the list', async ({ page }) => {
        await addPlayer(page, 'Alice');
        await addPlayer(page, 'Bob');
        await page.locator('.remove-player-btn').first().click();
        await expect(page.locator('#playerList li')).toHaveCount(1);
    });

    test('clears the input field after adding a player', async ({ page }) => {
        await addPlayer(page, 'Alice');
        await expect(page.locator('#playerName')).toHaveValue('');
    });

    // --- NEGATIVE ---

    test('shows error for empty name', async ({ page }) => {
        await page.click('#addPlayerBtn');
        await expect(page.locator('#playerError')).toContainText('ENTER A NAME');
    });

    test('shows error for whitespace-only name', async ({ page }) => {
        await addPlayer(page, '   ');
        await expect(page.locator('#playerError')).toContainText('ENTER A NAME');
    });

    test('shows error for name longer than 7 characters', async ({ page }) => {
        // Bypass maxlength="7" attribute to test the JS guard
        await addPlayerRaw(page, 'TooLongName'); // 11 chars
        await expect(page.locator('#playerError')).toContainText('MAX 7 CHARACTERS');
    });

    test('does not add a player when name is too long', async ({ page }) => {
        await addPlayerRaw(page, 'TooLongName');
        await expect(page.locator('#playerList li')).toHaveCount(0);
    });

    test('shows error for duplicate name', async ({ page }) => {
        await addPlayer(page, 'Alice');
        await addPlayer(page, 'Alice'); // stored as 'ALICE'; second 'ALICE' is duplicate
        await expect(page.locator('#playerError')).toContainText('ALREADY ADDED');
    });

    test('does not add duplicate player to list', async ({ page }) => {
        await addPlayer(page, 'Alice');
        await addPlayer(page, 'Alice');
        await expect(page.locator('#playerList li')).toHaveCount(1);
    });
});

// ============================================================
// LANDING PAGE — GAME START VALIDATION
// ============================================================
test.describe('Landing Page — Game Start Validation', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page);
    });

    // --- NEGATIVE ---

    test('shows error when starting with 0 players', async ({ page }) => {
        await page.click('#startGameBtn');
        await expect(page.locator('#playerError')).toContainText('NEED AT LEAST 3 PLAYERS');
    });

    test('shows error when starting with 1 player', async ({ page }) => {
        await addPlayer(page, 'Alice');
        await page.click('#startGameBtn');
        await expect(page.locator('#playerError')).toContainText('NEED AT LEAST 3 PLAYERS');
    });

    test('shows error when starting with 2 players', async ({ page }) => {
        await addPlayer(page, 'Alice');
        await addPlayer(page, 'Bob');
        await page.click('#startGameBtn');
        await expect(page.locator('#playerError')).toContainText('NEED AT LEAST 3 PLAYERS');
    });

    test('landing page stays visible when start is rejected', async ({ page }) => {
        await addPlayer(page, 'Alice');
        await page.click('#startGameBtn');
        await expect(page.locator('#landing-page')).toBeVisible();
    });

    // --- POSITIVE ---

    test('navigates to wheel screen with exactly 3 players', async ({ page }) => {
        await addPlayer(page, 'Alice');
        await addPlayer(page, 'Bob');
        await addPlayer(page, 'Carol');
        await page.click('#startGameBtn');
        await expect(page.locator('#wheel-screen')).toBeVisible();
        await expect(page.locator('#landing-page')).not.toBeVisible();
    });

    test('navigates to wheel screen with more than 3 players', async ({ page }) => {
        await addPlayer(page, 'Alice');
        await addPlayer(page, 'Bob');
        await addPlayer(page, 'Carol');
        await addPlayer(page, 'Dave');
        await page.click('#startGameBtn');
        await expect(page.locator('#wheel-screen')).toBeVisible();
    });
});

// ============================================================
// LANDING PAGE — RULES MODAL
// ============================================================
test.describe('Landing Page — Rules Modal', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page);
    });

    test('opens the rules modal', async ({ page }) => {
        await page.click('#rulesBtn');
        await expect(page.locator('#rules-modal')).toHaveClass(/active/);
    });

    test('rules modal shows key rule text', async ({ page }) => {
        await page.click('#rulesBtn');
        const modal = page.locator('#rules-modal');
        await expect(modal).toContainText('THREE MAN');
        await expect(modal).toContainText('DOUBLES');
    });

    test('closes the rules modal', async ({ page }) => {
        await page.click('#rulesBtn');
        await page.click('#closeRulesBtn');
        await expect(page.locator('#rules-modal')).not.toHaveClass(/active/);
    });
});

// ============================================================
// WHEEL SCREEN
// ============================================================
test.describe('Wheel Screen', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page);
        // Add 3 players and navigate to wheel
        await addPlayer(page, 'Alice');
        await addPlayer(page, 'Bob');
        await addPlayer(page, 'Carol');
        await page.click('#startGameBtn');
        await page.waitForSelector('#wheel-screen', { state: 'visible' });
    });

    test('spin button is enabled on arrival', async ({ page }) => {
        await expect(page.locator('#spinWheelBtn')).not.toBeDisabled();
        await expect(page.locator('#spinWheelBtn')).toHaveText('SPIN THE WHEEL');
    });

    test('spin button disables while spinning', async ({ page }) => {
        await page.click('#spinWheelBtn');
        await expect(page.locator('#spinWheelBtn')).toBeDisabled();
    });

    test('shows a winner result after spin completes', async ({ page }) => {
        await page.click('#spinWheelBtn');
        // Spin animation takes 4 seconds
        await page.waitForTimeout(4200);
        await expect(page.locator('#wheel-result')).toContainText('IS THE THREE MAN');
    });

    test('shows START GAME button after spin completes', async ({ page }) => {
        await page.click('#spinWheelBtn');
        await page.waitForTimeout(4200);
        await expect(page.locator('#spinWheelBtn')).toHaveText('START GAME');
        await expect(page.locator('#spinWheelBtn')).not.toBeDisabled();
    });

    test('START GAME navigates to game screen', async ({ page }) => {
        await page.click('#spinWheelBtn');
        await page.waitForTimeout(4200);
        await page.click('#spinWheelBtn'); // now says START GAME
        await expect(page.locator('#game-screen')).toBeVisible({ timeout: 3000 });
        await expect(page.locator('#wheel-screen')).not.toBeVisible();
    });
});
