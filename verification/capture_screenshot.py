from playwright.sync_api import sync_playwright
import os

def capture_screenshot():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Load the page
        file_path = os.path.abspath("migraine_tracker.html")
        page.goto(f"file://{file_path}")

        # Start a migraine to show the active state
        page.click("text=Start Migraine Now")
        page.wait_for_selector("#logFormSection:not(.hidden)")

        # Fill some details to make the screenshot interesting
        page.fill("#severity", "8")
        page.eval_on_selector("#severity", "el => { el.value = 8; el.dispatchEvent(new Event('input')); }")
        page.click("button[type='submit']")

        # Log a past one too to show history
        page.click("text=Update Details") # Actually let's just show active state
        # Wait for status active
        page.wait_for_selector("text=Migraine Active")

        # Take screenshot
        screenshot_path = "verification/migraine_tracker.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    capture_screenshot()
