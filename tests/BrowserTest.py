"""Focused browser flow with real Chromium against the local Worker API adapter."""

from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess
import os
import time
import unittest
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent


class PersonaBrowserTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = subprocess.Popen(
            ["node", "tests/WebServer.mjs"], cwd=ROOT,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        for _attempt in range(60):
            try:
                urllib.request.urlopen("http://127.0.0.1:8788/", timeout=1)
                break
            except OSError:
                time.sleep(0.1)
        else:
            cls.server.terminate()
            raise RuntimeError("Local browser-test server failed to start")

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=10)
        if cls.server.stdout:
            cls.server.stdout.close()

    def testQuickPromptEditAndZIPAcrossLocales(self):
        with sync_playwright() as playwright:
            chromeExecutable = os.environ.get("CHROME_EXECUTABLE")
            browser = playwright.chromium.launch(
                executable_path=chromeExecutable or playwright.chromium.executable_path,
                headless=True,
                args=["--no-sandbox"],
            )
            context = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 1080}, locale="zh-TW")
            page = context.new_page()
            page.goto("http://127.0.0.1:8788/")
            page.locator(".presetCard").first.wait_for()
            self.assertIn("AI 夥伴", page.locator("h1").inner_text())
            self.assertNotIn("Cloudflare", page.locator("body").inner_text())

            page.locator("#field-brief").fill("一位細心、會找正確職責 Owner 的研發助理")
            page.locator("#localeSelect").select_option("en")
            page.wait_for_function("document.querySelector('h1').textContent.includes('Create an AI teammate')")
            self.assertIn("研發助理", page.locator("#field-brief").input_value())
            page.locator("#localeSelect").select_option("zh-hans")
            page.wait_for_function("document.querySelector('h1').textContent.includes('创建有个性')")
            page.locator("#localeSelect").select_option("zh-hant")
            page.wait_for_function("document.querySelector('h1').textContent.includes('建立有個性')")
            page.locator("#advancedMode").click()
            page.locator("#field-name").fill("小晴")
            page.locator("#field-department").fill("總經理室")
            page.locator("#field-role").fill("總經理特助")

            page.locator("[data-method='prompt']").click()
            page.locator("#mainAction").click()
            page.wait_for_function("document.querySelector('#promptOutput').value.includes('總經理特助')")
            self.assertIn("Grokbot", page.locator("#promptOutput").input_value())

            self.assertEqual(page.locator("#apiToken").count(), 0)
            page.locator("#avatarStyle").select_option("pencil")
            page.locator("#generatedMarkdown").fill("# 小晴\n\n細心、專業。")
            with page.expect_download() as downloadInfo:
                page.locator("#packageButton").click()
            with zipfile.ZipFile(downloadInfo.value.path()) as archive:
                self.assertIn("persona.md", archive.namelist())
                self.assertIn("小晴", archive.read("persona.md").decode("utf-8"))

            page.locator("[data-method='worker']").click()
            page.locator("#includeAvatar").uncheck(force=True)
            page.locator("#mainAction").click()
            page.wait_for_function("document.querySelector('#draftMarkdown').value.includes('模擬人設')")
            page.locator("#draftEditTab").click()
            page.locator("#draftMarkdown").fill("# 小晴\n\n草稿經過人工修改。")
            with page.expect_download() as downloadInfo:
                page.locator("#downloadDraft").click()
            with zipfile.ZipFile(downloadInfo.value.path()) as archive:
                self.assertIn("manifest.json", archive.namelist())
                self.assertIn("草稿經過人工修改", archive.read("persona.md").decode("utf-8"))

            screenshot = ROOT / "tests" / "browser-preview.png"
            page.screenshot(path=screenshot, full_page=True)
            browser.close()
            self.assertTrue(screenshot.is_file())

    def testBeautyBriefWithRealisticAvatarDoesNotBlockForGender(self):
        # The site must trust AI interpretation, never a fixed gender lexicon.
        with sync_playwright() as playwright:
            browser=playwright.chromium.launch(headless=True,args=["--no-sandbox"])
            page=browser.new_page()
            page.goto("http://127.0.0.1:8788/")
            page.locator(".presetCard").first.wait_for()
            page.locator("#field-brief").fill("大美女，一個暗戀總經理的秘書，專業又幽默")
            page.locator("#includeAvatar").check(force=True)
            page.locator("#avatarStyle").select_option("realistic")
            page.locator("#mainAction").click()
            page.wait_for_function("document.querySelector('#draftMarkdown').value.includes('模擬人設')")
            self.assertTrue(page.locator("#draftAvatarPreview").is_visible())
            self.assertNotIn("需要明確人物性別",page.locator("#status").inner_text())
            # Editing Markdown invalidates the previously generated avatar;
            # the zip must not silently include the old inconsistent picture.
            page.locator("#draftEditTab").click()
            page.locator("#draftMarkdown").fill("# 不同人物\\n\\n現在是新的角色。")
            with page.expect_download() as downloadInfo:
                page.locator("#downloadDraft").click()
            with zipfile.ZipFile(downloadInfo.value.path()) as archive:
                self.assertNotIn("avatar.jpg",archive.namelist())
                self.assertNotIn("avatar.png",archive.namelist())
                self.assertIn("不同人物",archive.read("persona.md").decode("utf-8"))
            browser.close()


if __name__ == "__main__":
    unittest.main()
