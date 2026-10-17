// Big moments (src/ui/components/Moments.tsx) take the whole screen after a sim until they're
// dismissed: the QA scripts tap Continue on any that are up before they go on.
export async function clearMoments(page) {
  for (let i = 0; i < 6 && (await page.locator('.moment').count()); i++) {
    await page
      .locator('.moment .moment-go')
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(250);
  }
}
