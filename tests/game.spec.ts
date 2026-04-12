/**
 * Game Rules, Dice Logic & Button Tests
 *
 * Uses window.__test to set up deterministic game state and simulate dice rolls
 * without the Three.js physics engine. All dice logic and UI assertions are
 * tested against the prompt title, description, and button text that the game
 * renders after processRollResults() runs.
 *
 * Default test setup (DEFAULT_STATE):
 *   Players: Alice (0), Bob (1), Carol (2)
 *   Three Man: Carol
 *   Current roller: Bob (index 1)
 *     → Right neighbor (sum=7 target): Carol (index 2)
 *     → Left  neighbor (sum=11 target): Alice (index 0)
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';

const FILE_URL =
    'file:///' +
    path.join(__dirname, '..', 'index.html').replace(/\\/g, '/').replace(/ /g, '%20');

const PLAYERS = ['Alice', 'Bob', 'Carol'];

type GameState = {
    playerNames: string[];
    threeManName: string | null;
    currentIdx: number;
};

const DEFAULT_STATE: GameState = {
    playerNames: PLAYERS,
    threeManName: 'Carol',
    currentIdx: 1, // Bob rolls
};

// ---- Helpers ---------------------------------------------------------------

async function loadPage(page: Page) {
    await page.goto(FILE_URL);
    await page.waitForSelector('#intro-overlay', { state: 'visible' });
    await page.click('#intro-overlay');
    await page.waitForSelector('#intro-overlay', { state: 'hidden' });
}

async function initGame(page: Page, state: GameState) {
    await page.evaluate((s: GameState) => {
        (window as any).__test.initGame(s.playerNames, s.threeManName, s.currentIdx);
    }, state);
    await page.waitForSelector('#game-screen', { state: 'visible' });
}

/**
 * Simulate a dice roll and wait for the action prompt to appear.
 * Uses window.__test.processRoll which overrides getDieResult for two calls.
 */
async function simulateRoll(page: Page, die1: number, die2: number) {
    await page.evaluate(([d1, d2]: number[]) => {
        (window as any).__test.processRoll(d1, d2);
    }, [die1, die2]);
    // processRollResults shows the action-prompt inside a 300 ms setTimeout
    await page.waitForSelector('#action-prompt.active', { timeout: 2000 });
}

/** Click the Three Man drink overlay to dismiss it (it's on top of action-prompt). */
async function dismissThreeManOverlay(page: Page) {
    const overlay = page.locator('#threeman-drink-overlay.active');
    if (await overlay.isVisible({ timeout: 300 }).catch(() => false)) {
        await page.evaluate(() => (window as any).__test.dismissThreeManOverlay());
    }
}

// ============================================================
// THREE MAN RULES — non-Three Man rolls a 3
// ============================================================
test.describe('Three Man Rules — Non-Three Man rolls a 3', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page);
        await initGame(page, DEFAULT_STATE); // Bob rolls, Carol is Three Man
    });

    // --- POSITIVE ---

    test('die1 = 3 → prompt says Carol (Three Man) takes a sip', async ({ page }) => {
        await simulateRoll(page, 3, 1);
        await expect(page.locator('#prompt-desc')).toContainText('Carol');
        await expect(page.locator('#prompt-desc')).toContainText('SIP');
    });

    test('die2 = 3 → Three Man (Carol) takes a sip', async ({ page }) => {
        await simulateRoll(page, 2, 3);
        await expect(page.locator('#prompt-desc')).toContainText('Carol');
        await expect(page.locator('#prompt-desc')).toContainText('SIP');
    });

    test('sum = 3 (1+2) → Three Man (Carol) takes a sip', async ({ page }) => {
        await simulateRoll(page, 1, 2);
        await expect(page.locator('#prompt-desc')).toContainText('Carol');
        await expect(page.locator('#prompt-desc')).toContainText('SIP');
    });

    test('roller goes again (ROLL AGAIN button shown)', async ({ page }) => {
        await simulateRoll(page, 3, 1);
        await expect(page.locator('#dismissBtn')).toContainText('ROLL AGAIN');
    });

    // --- NEGATIVE ---

    test('die1 = 3 does NOT show "Nothing happens"', async ({ page }) => {
        await simulateRoll(page, 3, 1);
        await expect(page.locator('#prompt-desc')).not.toContainText('Nothing happens');
    });

    test('Three Man is NOT prompted to pass the title (non-Three Man rolling)', async ({ page }) => {
        await simulateRoll(page, 3, 1);
        await expect(page.locator('#player-select-list')).not.toBeVisible();
    });
});

// ============================================================
// THREE MAN RULES — Three Man rolls a 3 (non-doubles)
// ============================================================
test.describe('Three Man Rules — Three Man rolls a 3 (non-doubles)', () => {
    // Bob (idx=1) is both the roller AND the Three Man
    const threeManRollerState: GameState = {
        playerNames: PLAYERS,
        threeManName: 'Bob',
        currentIdx: 1,
    };

    test.beforeEach(async ({ page }) => {
        await loadPage(page);
        await initGame(page, threeManRollerState);
    });

    // --- POSITIVE ---

    test('shows "PASS THE TITLE" in the prompt', async ({ page }) => {
        await simulateRoll(page, 3, 2);
        await expect(page.locator('#prompt-desc')).toContainText('PASS THE TITLE');
    });

    test('shows player selection list', async ({ page }) => {
        await simulateRoll(page, 3, 2);
        await expect(page.locator('#player-select-list')).toBeVisible();
    });

    test('shows GIVE TO buttons for other players', async ({ page }) => {
        await simulateRoll(page, 3, 2);
        await expect(page.locator('#player-select-list')).toContainText('GIVE TO Alice');
        await expect(page.locator('#player-select-list')).toContainText('GIVE TO Carol');
    });

    test('shows KEEP option for current Three Man', async ({ page }) => {
        await simulateRoll(page, 3, 2);
        await expect(page.locator('#player-select-list')).toContainText('STAY AS THREE MAN');
    });

    test('Three Man can transfer title to another player', async ({ page }) => {
        await simulateRoll(page, 3, 2);
        await dismissThreeManOverlay(page);
        await page.locator('#player-select-list button', { hasText: 'GIVE TO Alice' }).click();
        await expect(page.locator('#hud-threeman')).toContainText('Alice');
    });

    test('Three Man can keep the title', async ({ page }) => {
        await simulateRoll(page, 3, 2);
        await dismissThreeManOverlay(page);
        await page.locator('#player-select-list button', { hasText: 'STAY AS THREE MAN' }).click();
        await expect(page.locator('#hud-threeman')).toContainText('Bob');
    });

    // --- NEGATIVE ---

    test('dismiss button is hidden while waiting for selection', async ({ page }) => {
        await simulateRoll(page, 3, 2);
        await expect(page.locator('#dismissBtn')).not.toBeVisible();
    });
});

// ============================================================
// THREE MAN RULES — double 3s
// ============================================================
test.describe('Three Man Rules — Double 3s', () => {

    test.beforeEach(async ({ page }) => {
        await loadPage(page);
    });

    // --- POSITIVE ---

    test('Three Man rolling 3+3 shows "DOUBLE 3S" in prompt', async ({ page }) => {
        const state: GameState = { playerNames: PLAYERS, threeManName: 'Bob', currentIdx: 1 };
        await initGame(page, state);
        await simulateRoll(page, 3, 3);
        await expect(page.locator('#prompt-desc')).toContainText('DOUBLE 3S');
    });

    test('Three Man rolling 3+3 shows title-pass selection BEFORE doubles', async ({ page }) => {
        const state: GameState = { playerNames: PLAYERS, threeManName: 'Bob', currentIdx: 1 };
        await initGame(page, state);
        await simulateRoll(page, 3, 3);
        // Player list (for title transfer) should be visible
        await expect(page.locator('#player-select-list')).toBeVisible();
        // Doubles distribution should NOT be shown yet
        await expect(page.locator('#dice-distribution')).not.toBeVisible();
    });

    test('Three Man rolling 3+3 shows doubles distribution after title is passed', async ({ page }) => {
        const state: GameState = { playerNames: PLAYERS, threeManName: 'Bob', currentIdx: 1 };
        await initGame(page, state);
        await simulateRoll(page, 3, 3);
        await page.locator('#player-select-list button', { hasText: 'GIVE TO Alice' }).click();
        await dismissThreeManOverlay(page);
        await page.waitForSelector('#action-prompt.active', { timeout: 2000 });
        await expect(page.locator('#dice-distribution')).toBeVisible();
    });

    test('Non-Three Man rolling 3+3 → Three Man (Carol) takes TWO sips', async ({ page }) => {
        await initGame(page, DEFAULT_STATE); // Bob rolls, Carol is Three Man
        await simulateRoll(page, 3, 3);
        await expect(page.locator('#prompt-desc')).toContainText('TWO SIPS');
        await expect(page.locator('#prompt-desc')).toContainText('Carol');
    });

    test('Non-Three Man rolling 3+3 shows doubles distribution', async ({ page }) => {
        await initGame(page, DEFAULT_STATE);
        await simulateRoll(page, 3, 3);
        await expect(page.locator('#dice-distribution')).toBeVisible();
    });

    // --- NEGATIVE ---

    test('Non-Three Man rolling 3+3 does NOT show title-pass buttons', async ({ page }) => {
        await initGame(page, DEFAULT_STATE); // Bob (non-Three Man) rolls 3+3
        await simulateRoll(page, 3, 3);
        // player-select-list for title transfer should not show (doubles distribution shows instead)
        await expect(page.locator('#player-select-list')).not.toBeVisible();
    });
});

// ============================================================
// THREE MAN RULES — no Three Man exists
// ============================================================
test.describe('Three Man Rules — No Three Man assigned', () => {
    const noThreeManState: GameState = {
        playerNames: PLAYERS,
        threeManName: null,
        currentIdx: 0,
    };

    test.beforeEach(async ({ page }) => {
        await loadPage(page);
        await initGame(page, noThreeManState);
    });

    // --- POSITIVE ---

    test('rolling a 3 shows "PICK THE NEW THREE MAN"', async ({ page }) => {
        await simulateRoll(page, 3, 1);
        await expect(page.locator('#prompt-desc')).toContainText('PICK THE NEW THREE MAN');
    });

    test('all players are shown as Three Man candidates', async ({ page }) => {
        await simulateRoll(page, 3, 1);
        for (const player of PLAYERS) {
            await expect(page.locator('#player-select-list')).toContainText(player);
        }
    });

    test('selecting a player assigns them as Three Man', async ({ page }) => {
        await simulateRoll(page, 3, 1);
        await page.locator('#player-select-list button', { hasText: 'Carol' }).click();
        await dismissThreeManOverlay(page);
        await expect(page.locator('#hud-threeman')).toContainText('Carol');
    });

    // --- NEGATIVE ---

    test('HUD shows "NONE" before Three Man is assigned', async ({ page }) => {
        await expect(page.locator('#hud-threeman')).toContainText('NONE');
    });

    test('rolling a non-3 without a Three Man does not show candidate list', async ({ page }) => {
        await simulateRoll(page, 2, 6); // sum=8, no 3
        await expect(page.locator('#player-select-list')).not.toBeVisible();
    });
});

// ============================================================
// SPECIAL ROLLS — sum 7, 11, 9
// ============================================================
test.describe('Special Rolls', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page);
        await initGame(page, DEFAULT_STATE); // Bob (idx=1) rolls
    });

    // --- POSITIVE ---

    test('sum = 7 → right neighbor (Carol, idx=2) drinks', async ({ page }) => {
        await simulateRoll(page, 5, 2); // 5+2=7, no 3s
        await expect(page.locator('#prompt-desc')).toContainText('7');
        await expect(page.locator('#prompt-desc')).toContainText('Carol');
    });

    test('sum = 11 → left neighbor (Alice, idx=0) drinks', async ({ page }) => {
        await simulateRoll(page, 6, 5); // 6+5=11, no 3s
        await expect(page.locator('#prompt-desc')).toContainText('11');
        await expect(page.locator('#prompt-desc')).toContainText('Alice');
    });

    test('sum = 7 → roller goes again (ROLL AGAIN)', async ({ page }) => {
        await simulateRoll(page, 5, 2);
        await expect(page.locator('#dismissBtn')).toContainText('ROLL AGAIN');
    });

    test('sum = 11 → roller goes again (ROLL AGAIN)', async ({ page }) => {
        await simulateRoll(page, 6, 5);
        await expect(page.locator('#dismissBtn')).toContainText('ROLL AGAIN');
    });

    test('sum = 9 with social9 ON → "SOCIAL" and everyone drinks', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('social9', true));
        await simulateRoll(page, 4, 5); // 4+5=9, no 3s
        await expect(page.locator('#prompt-desc')).toContainText('SOCIAL');
        await expect(page.locator('#prompt-desc')).toContainText('Everyone');
    });

    test('nothing special → shows "Nothing happens"', async ({ page }) => {
        await simulateRoll(page, 2, 6); // sum=8
        await expect(page.locator('#prompt-desc')).toContainText('Nothing happens');
    });

    test('nothing special → shows "PASS TO" next player button', async ({ page }) => {
        await simulateRoll(page, 2, 6); // sum=8, Bob→next is Carol
        await expect(page.locator('#dismissBtn')).toContainText('PASS TO Carol');
    });

    // --- NEGATIVE ---

    test('sum = 9 with social9 OFF → no SOCIAL prompt', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('social9', false));
        await simulateRoll(page, 4, 5);
        await expect(page.locator('#prompt-desc')).not.toContainText('SOCIAL');
    });

    test('sum = 7 does NOT say "Nothing happens"', async ({ page }) => {
        await simulateRoll(page, 5, 2);
        await expect(page.locator('#prompt-desc')).not.toContainText('Nothing happens');
    });

    test('sum = 11 does NOT say "Nothing happens"', async ({ page }) => {
        await simulateRoll(page, 6, 5);
        await expect(page.locator('#prompt-desc')).not.toContainText('Nothing happens');
    });
});

// ============================================================
// GAMEPLAY TOGGLES — Reverse Round, Chain Reaction, Social Overload
// ============================================================
test.describe('Gameplay Toggles', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page);
        await initGame(page, DEFAULT_STATE); // Bob (idx=1) rolls
        // right=Carol (idx=2), left=Alice (idx=0)
    });

    // --- Reverse Round ---

    test('Reverse Round ON: sum=7 → LEFT (Alice) drinks instead of right', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('reverseRound', true));
        await simulateRoll(page, 5, 2); // sum=7
        await expect(page.locator('#prompt-desc')).toContainText('Alice');
        await expect(page.locator('#prompt-desc')).toContainText('REVERSED');
    });

    test('Reverse Round ON: sum=11 → RIGHT (Carol) drinks instead of left', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('reverseRound', true));
        await simulateRoll(page, 6, 5); // sum=11
        await expect(page.locator('#prompt-desc')).toContainText('Carol');
        await expect(page.locator('#prompt-desc')).toContainText('REVERSED');
    });

    test('Reverse Round OFF: sum=7 → right (Carol) drinks (default behavior)', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('reverseRound', false));
        await simulateRoll(page, 5, 2);
        await expect(page.locator('#prompt-desc')).toContainText('Carol');
        await expect(page.locator('#prompt-desc')).not.toContainText('REVERSED');
    });

    // --- Chain Reaction ---

    test('Chain Reaction ON: sum=7 → BOTH Alice and Carol drink', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('chainReaction', true));
        await simulateRoll(page, 5, 2); // sum=7
        const desc = page.locator('#prompt-desc');
        await expect(desc).toContainText('CHAIN REACTION');
        await expect(desc).toContainText('Alice');
        await expect(desc).toContainText('Carol');
    });

    test('Chain Reaction ON: sum=11 → BOTH Alice and Carol drink', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('chainReaction', true));
        await simulateRoll(page, 6, 5); // sum=11
        const desc = page.locator('#prompt-desc');
        await expect(desc).toContainText('CHAIN REACTION');
        await expect(desc).toContainText('Alice');
        await expect(desc).toContainText('Carol');
    });

    // --- Social Overload ---

    test('Social Overload ON: sum=6 non-doubles → everyone drinks', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('socialOverload', true));
        await simulateRoll(page, 1, 5); // sum=6, not doubles (1≠5)
        await expect(page.locator('#prompt-desc')).toContainText('SOCIAL OVERLOAD');
    });

    test('Social Overload OFF: sum=6 non-doubles → no social', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('socialOverload', false));
        await simulateRoll(page, 1, 5); // sum=6
        await expect(page.locator('#prompt-desc')).not.toContainText('SOCIAL OVERLOAD');
    });

    test('Social Overload ON: doubles (e.g. 3+3=6) → doubles path taken, NOT social overload', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('socialOverload', true));
        await simulateRoll(page, 3, 3); // doubles — socialOverload guard checks !isDoubles
        await expect(page.locator('#prompt-desc')).not.toContainText('SOCIAL OVERLOAD');
    });

    // --- Hot Potato ---

    test('Hot Potato ON: matching previous roll sum → previous roller drinks again', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('hotPotato', true));
        // Bob (idx=1) rolls sum=8 → sets lastRollSum=8, lastRoller='Bob'
        await simulateRoll(page, 2, 6); // sum=8, no 3s, not doubles
        await page.click('#dismissBtn'); // pass turn → Carol (idx=2)
        // Carol (idx=2) rolls same sum=8 → Hot Potato fires for Bob
        await simulateRoll(page, 6, 2); // sum=8, no 3s, not doubles
        await expect(page.locator('#prompt-desc')).toContainText('HOT POTATO');
        await expect(page.locator('#prompt-desc')).toContainText('Bob');
    });

    test('Hot Potato OFF: matching sum → no hot potato message', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('hotPotato', false));
        // Roll sum=8 twice in a row
        await simulateRoll(page, 2, 6);
        await page.click('#dismissBtn');
        await simulateRoll(page, 2, 6);
        await expect(page.locator('#prompt-desc')).not.toContainText('HOT POTATO');
    });
});

// ============================================================
// DOUBLES DISTRIBUTION
// ============================================================
test.describe('Doubles Distribution', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page);
        await initGame(page, DEFAULT_STATE);
    });

    // --- POSITIVE ---

    test('regular doubles (4+4) → shows distribution options', async ({ page }) => {
        await simulateRoll(page, 4, 4);
        await expect(page.locator('#dice-distribution')).toBeVisible();
    });

    test('distribution shows "PASS 1 DIE TO 2 PEOPLE" option', async ({ page }) => {
        await simulateRoll(page, 4, 4);
        await expect(page.locator('#dice-distribution')).toContainText('PASS 1 DIE TO 2 PEOPLE');
    });

    test('distribution shows "PASS BOTH DICE TO 1 PERSON" option', async ({ page }) => {
        await simulateRoll(page, 4, 4);
        await expect(page.locator('#dice-distribution')).toContainText('PASS BOTH DICE TO 1 PERSON');
    });

    test('selecting "1 die to 2 people" shows player select list', async ({ page }) => {
        await simulateRoll(page, 4, 4);
        await page.locator('#dice-distribution button', { hasText: 'PASS 1 DIE TO 2 PEOPLE' }).click();
        await expect(page.locator('#player-select-list')).toBeVisible();
    });

    test('selecting "both dice to 1 person" shows player select list', async ({ page }) => {
        await simulateRoll(page, 4, 4);
        await page.locator('#dice-distribution button', { hasText: 'PASS BOTH DICE TO 1 PERSON' }).click();
        await expect(page.locator('#player-select-list')).toBeVisible();
    });

    test('"1 die to 2 people" — can select 2 different players', async ({ page }) => {
        await simulateRoll(page, 4, 4);
        await page.locator('#dice-distribution button', { hasText: 'PASS 1 DIE TO 2 PEOPLE' }).click();
        // Alice and Carol are other players (Bob is roller)
        await page.locator('#player-select-list button', { hasText: 'Alice' }).click();
        await page.locator('#player-select-list button', { hasText: 'Carol' }).click();
        const confirm = page.locator('#player-select-list button', { hasText: 'CONFIRM' });
        await expect(confirm).toBeVisible();
        await expect(confirm).not.toContainText('more'); // "CONFIRM (N more)" → gone
    });

    test('"both dice to 1 person" — confirm becomes available after 1 selection', async ({ page }) => {
        await simulateRoll(page, 4, 4);
        await page.locator('#dice-distribution button', { hasText: 'PASS BOTH DICE TO 1 PERSON' }).click();
        await page.locator('#player-select-list button', { hasText: 'Alice' }).click();
        const confirm = page.locator('#player-select-list button', { hasText: 'CONFIRM' });
        await expect(confirm).not.toContainText('more');
    });

    // --- NEGATIVE ---

    test('Double Trouble ON: doubles → no distribution shown', async ({ page }) => {
        await page.evaluate(() => (window as any).__test.setGameplay('doubleTrouble', true));
        await simulateRoll(page, 4, 4);
        await expect(page.locator('#dice-distribution')).not.toBeVisible();
    });
});

// ============================================================
// TURN MANAGEMENT
// ============================================================
test.describe('Turn Management', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page);
    });

    // --- POSITIVE ---

    test('dismiss advances to next player after a nothing roll', async ({ page }) => {
        await initGame(page, DEFAULT_STATE); // Bob (idx=1)
        await simulateRoll(page, 2, 6); // sum=8, nothing
        await page.click('#dismissBtn');
        const state = await page.evaluate(() => (window as any).__test.getState());
        expect(state.currentPlayerIndex).toBe(2); // Carol
    });

    test('ROLL AGAIN keeps the same player after a 3 roll', async ({ page }) => {
        await initGame(page, DEFAULT_STATE); // Bob (idx=1)
        await simulateRoll(page, 3, 1);
        await page.click('#dismissBtn');
        const state = await page.evaluate(() => (window as any).__test.getState());
        expect(state.currentPlayerIndex).toBe(1); // still Bob
    });

    test('turn wraps from last player back to first (index 0)', async ({ page }) => {
        const state: GameState = { playerNames: PLAYERS, threeManName: 'Carol', currentIdx: 2 };
        await initGame(page, state); // Carol (idx=2) rolls
        await simulateRoll(page, 2, 6); // nothing
        await page.click('#dismissBtn');
        const gs = await page.evaluate(() => (window as any).__test.getState());
        expect(gs.currentPlayerIndex).toBe(0); // wraps to Alice
    });

    test('PASS TO button names the next player', async ({ page }) => {
        await initGame(page, DEFAULT_STATE); // Bob (idx=1) → next is Carol (idx=2)
        await simulateRoll(page, 2, 6);
        await expect(page.locator('#dismissBtn')).toContainText('PASS TO Carol');
    });

    // --- NEGATIVE ---

    test('action prompt is hidden before any roll', async ({ page }) => {
        await initGame(page, DEFAULT_STATE);
        await expect(page.locator('#action-prompt')).not.toHaveClass(/active/);
    });

    test('roll button re-enables after a turn is dismissed', async ({ page }) => {
        await initGame(page, DEFAULT_STATE);
        await simulateRoll(page, 2, 6);
        await page.click('#dismissBtn');
        await expect(page.locator('#rollBtn')).not.toBeDisabled();
    });
});

// ============================================================
// SETTINGS & BUTTONS
// ============================================================
test.describe('Settings & Buttons', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page);
    });

    // --- POSITIVE ---

    test('settings button opens the settings overlay', async ({ page }) => {
        await page.click('#settingsBtn');
        await expect(page.locator('#settings-overlay')).toHaveClass(/active/);
    });

    test('Close button dismisses the settings overlay', async ({ page }) => {
        await page.click('#settingsBtn');
        await page.click('#settingsCloseBtn');
        await expect(page.locator('#settings-overlay')).not.toHaveClass(/active/);
    });

    test('Skip Turn advances the current player', async ({ page }) => {
        await initGame(page, DEFAULT_STATE); // Bob (idx=1)
        await page.click('#settingsBtn');
        await page.click('#settingsSkipBtn');
        const state = await page.evaluate(() => (window as any).__test.getState());
        expect(state.currentPlayerIndex).toBe(2); // Carol
    });

    test('Skip Turn closes the settings overlay', async ({ page }) => {
        await initGame(page, DEFAULT_STATE);
        await page.click('#settingsBtn');
        await page.click('#settingsSkipBtn');
        await expect(page.locator('#settings-overlay')).not.toHaveClass(/active/);
    });

    test('Reset Three Man clears the Three Man title', async ({ page }) => {
        await initGame(page, DEFAULT_STATE); // Carol is Three Man
        await page.click('#settingsBtn');
        await page.click('#settingsResetThreeManBtn');
        await expect(page.locator('#hud-threeman')).toContainText('NONE');
    });

    test('Remove player works when there are 4+ players', async ({ page }) => {
        await initGame(page, {
            playerNames: ['Alice', 'Bob', 'Carol', 'Dave'],
            threeManName: 'Dave',
            currentIdx: 0,
        });
        await page.click('#settingsBtn');
        const firstRemove = page.locator('.settings-remove-btn').first();
        await expect(firstRemove).not.toBeDisabled();
        await firstRemove.click();
        const state = await page.evaluate(() => (window as any).__test.getState());
        expect(state.players).toHaveLength(3);
    });

    test('Removing the Three Man clears the Three Man title', async ({ page }) => {
        await initGame(page, {
            playerNames: ['Alice', 'Bob', 'Carol', 'Dave'],
            threeManName: 'Alice',
            currentIdx: 1,
        });
        await page.click('#settingsBtn');
        // Alice is first player — click her Remove button
        await page.locator('.settings-remove-btn').first().click();
        await expect(page.locator('#hud-threeman')).toContainText('NONE');
    });

    test('Exit To Menu returns to landing page', async ({ page }) => {
        await initGame(page, DEFAULT_STATE);
        await page.click('#exitToMenuBtn');
        await expect(page.locator('#landing-page')).toBeVisible({ timeout: 2000 });
    });

    test('Exit To Menu clears player list UI', async ({ page }) => {
        await initGame(page, DEFAULT_STATE);
        await page.click('#exitToMenuBtn');
        await page.waitForSelector('#landing-page', { state: 'visible' });
        await expect(page.locator('#playerList li')).toHaveCount(0);
    });

    test('View Rules from settings opens rules modal', async ({ page }) => {
        await page.click('#settingsBtn');
        await page.click('#settingsRulesBtn');
        await expect(page.locator('#rules-modal')).toHaveClass(/active/);
    });

    // --- NEGATIVE ---

    test('Remove player buttons disabled when exactly 3 players', async ({ page }) => {
        await initGame(page, DEFAULT_STATE); // 3 players
        await page.click('#settingsBtn');
        const removeBtns = page.locator('.settings-remove-btn');
        const count = await removeBtns.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
            await expect(removeBtns.nth(i)).toBeDisabled();
        }
    });

    test('Skip Turn is not shown on landing page', async ({ page }) => {
        // Settings opened from landing page (game not active)
        await page.click('#settingsBtn');
        await expect(page.locator('#settingsSkipBtn')).not.toBeVisible();
    });

    test('Reset Three Man is not shown on landing page', async ({ page }) => {
        await page.click('#settingsBtn');
        await expect(page.locator('#settingsResetThreeManBtn')).not.toBeVisible();
    });
});

// ============================================================
// HUD — Player Strip
// ============================================================
test.describe('HUD Display', () => {
    test.beforeEach(async ({ page }) => {
        await loadPage(page);
    });

    test('HUD shows current Three Man name', async ({ page }) => {
        await initGame(page, DEFAULT_STATE); // Carol is Three Man
        await expect(page.locator('#hud-threeman')).toContainText('Carol');
    });

    test('HUD shows "NONE" when there is no Three Man', async ({ page }) => {
        await initGame(page, { playerNames: PLAYERS, threeManName: null, currentIdx: 0 });
        await expect(page.locator('#hud-threeman')).toContainText('NONE');
    });

    test('current roller pill has ROLLING label', async ({ page }) => {
        await initGame(page, DEFAULT_STATE); // Bob (idx=1) is rolling
        await expect(page.locator('.is-rolling')).toContainText('Bob');
        await expect(page.locator('.is-rolling .pill-role')).toContainText('ROLLING');
    });

    test('Three Man pill has 3-MAN label', async ({ page }) => {
        await initGame(page, DEFAULT_STATE); // Carol is Three Man (idx=2)
        await expect(page.locator('.is-three-man .pill-name')).toContainText('Carol');
    });

    test('all player names appear in the strip', async ({ page }) => {
        await initGame(page, DEFAULT_STATE);
        for (const player of PLAYERS) {
            await expect(page.locator('#player-strip')).toContainText(player);
        }
    });
});
