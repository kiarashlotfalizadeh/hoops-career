// The Play options (the Continue bar's arrow) as a player uses them, for the QA scripts: open the
// sheet, take the first option whose label starts with `label`, and wait for the sim it starts.
import { clearMoments } from './moments.mjs';

/** Wait for a sim or phase change behind the progress bar to finish, then clear any big moment it brought up. */
export async function waitSim(page, timeout = 600_000) {
  await page.waitForTimeout(300);
  await page.waitForSelector('.simbar', { state: 'detached', timeout }).catch(() => {});
  await page.waitForTimeout(300);
  await clearMoments(page);
}

/**
 * Take a Play option by the start of its label (a string or a RegExp source). Resolves false, with
 * the sheet closed, when there's no such option or it's disabled.
 */
export async function play(page, label) {
  await clearMoments(page);
  await page.getByRole('button', { name: 'Play options', exact: true }).click();
  await page.waitForTimeout(300);
  const b = page
    .locator('.sheet')
    .getByRole('button', { name: new RegExp('^' + label) })
    .first();
  if (!(await b.count()) || (await b.isDisabled())) {
    await page.keyboard.press('Escape');
    await page
      .locator('.sheet-backdrop')
      .click({ position: { x: 5, y: 5 } })
      .catch(() => {});
    return false;
  }
  await b.click();
  await waitSim(page);
  return true;
}
