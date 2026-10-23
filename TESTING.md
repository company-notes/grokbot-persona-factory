# Testing Guide for Coding Agents

This document tells any coding agent (Claude Code, Codex, Grok, ...) how Nuwa Information organizes automated tests, and how to bootstrap tests in a project that has none (such as Checklist).

Sources this guide is distilled from:
- Team rules deck: `Fabulinus\trunk\Documents\自動化測試.pptx`
- Reference implementation: `Mercurius\trunk\Pixiu\Products\FileShare\FileShareServer\tests` (FastFileLink server). When in doubt, read the files there.

---

## 1. Culture

1. **「不貳過」: never make the same mistake twice.** We do not do strict TDD. Every bug that has actually happened gets a regression test written **before** its fix: first red (bug reproduced), then green (bug fixed). See §4.3. That way it cannot come back. Code that has broken before is likely to break again.
2. **Re-run the tests after every refactor.**
3. **One focused end-to-end test comes first** (§5). It is what you run on every change.
4. **A real end-to-end test uses a real browser.** Drive the live server with Selenium, the way a user clicks through it. Django's test `Client` is for API/endpoint tests only. It skips templates, JavaScript, CSRF and redirect behavior in the browser, so a passing `Client` test does not prove the page works.
5. **Real over mock.** A test that mocks the thing it depends on almost never catches a real bug: it only proves the code matches the mock. End-to-end tests run against real systems (real DB, real server, real browser, real HTTP between our own components). Mock only:
   - in focused unit tests of pure logic, or
   - for external systems with side effects (email, payment, third-party APIs) **when no test account is configured**.
   
   When a test account is configured through env variables, the end-to-end test uses the real external system. For email, that means sending a real email and reading it back over IMAP (§4.4).
6. **The full run is `python manage.py testall`** (Iuppiter), the same command CI (Jenkins) runs (§7).
7. **No redundant tests.** Every test must be able to catch something no other test catches. See §4.1.
8. **Test code follows the same coding rules as production code.**
   - Use the project's own `CODE_PRINCIPLES.md` if it has one. Otherwise use `Mercurius\trunk\Misc\Rules\CODE_PRINCIPLES.md`: camelCase, acronym casing, early returns, fail fast, no silent `except: pass`, helpers encapsulated in classes, `@classmethod` over `@staticmethod`, and so on.
   - Always **DRY, OO and separation of concerns**:
     - Shared setup, flows and checks live in base classes and mixins.
     - Each class owns one concern: driver management, login, data seeding, email polling.
     - Tests contain only the scenario and its assertions.
   - English comments and output.

---

## 2. Test levels

| Level | What it covers | Tools | Example in FileShareServer |
|---|---|---|---|
| Unit (selective, see §4.1) | One function/method/class that is core, changes often, or has many edge cases / input combinations. | `unittest.TestCase` + `unittest.mock` | `tests/main/ServiceTest.py` |
| Integration (API / endpoint) | A JSON/API endpoint through Django's URL routing, with the test DB. | `django.test.TestCase` + `Client` / DRF `APIClient` | `tests/api/ViewsTest.py`, `tests/main/LoginTest.py` |
| Acceptance / end-to-end (**most important**) | A whole user flow in a **real browser** against a live server. For products whose real client is not a browser (e.g. the FileShare CLI), use that real client. | `StaticLiveServerTestCase` + Selenium (`BrowserDriverMixin`) | `tests/brand/WhiteLabelTest.py`, `tests/domain/CustomDomainTest.py`, `tests/BrowserTestBase.py`, `tests/CoreUploadTest.py` |

For a web UI, an end-to-end test means a browser test. Use the Django `Client` only for API tests.

---

## 3. Layout and naming

```
<ProjectRoot>/
    manage.py
    REQUIREMENTS.txt
    REQUIREMENTS_TEST.txt        # test-only deps (selenium, xmlrunner, ...)
    main/                        # Django app
        views.py                 # Django convention file: lowercase
        models.py
        Base.py                  # non-Django module: CamelCase
    tests/
        __init__.py              # test runner + shared test infrastructure
        CoreFlowTest.py          # the focused end-to-end browser test (cross-app)
        BrowserTestBase.py       # live server + Selenium driver + flow helpers
        fixtures/                # test-only fixtures
        test-reports/            # xmlrunner output (generated)
        main/                    # one folder per app, mirrors the app
            __init__.py
            ViewsTest.py         # tests for main/views.py
            ModelsTest.py        # tests for main/models.py
            BaseTest.py          # tests for main/Base.py
```

Rules:
- All tests live in the top-level `tests/` package. Tests for an app go in `tests/<appName>/`. Every folder needs an `__init__.py`.
- **Module naming:** only Django convention files (`models.py`, `views.py`, `forms.py`, `admin.py`, `urls.py`, `apps.py`, `signals.py`, ...) and packages (e.g. `services/__init__.py`) are lowercase. Any other module is CamelCase: `Base.py`, `Services.py`, not `services.py`.
- **A test file is named after the module it tests, plus `Test`, always CamelCase:** `views.py` → `ViewsTest.py`, `models.py` → `ModelsTest.py`, `Base.py` → `BaseTest.py`. Discovery pattern is `*Test.py`. (The old deck screenshot shows `TestView.py`; the current convention is the suffix form.)
- Cross-app flows and shared bases sit directly in `tests/` (`CoreUploadTest.py`, `UploadTestBase.py`, `BrowserTestBase.py`).
- Test classes: `<Thing>Test` / `<Thing>Tests`, one class per view, endpoint or service (`UserInformationAPITest`, `InvitationServiceTests`).
- Test methods: `test` + camelCase description of the scenario, `test<Subject><Condition>`: `testUserInformationAPISuccess`, `testUserInformationAPISerialNumberNotFound`, `testOtpLoginFlowWithWrongOtp`.
- Every file starts with the standard Nuwa header (SVN keywords are expanded by SVN):

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
# $Id$
#
# Copyright (c) 2026 Nuwa Information Co., Ltd, All Rights Reserved.
#
# Licensed under the Proprietary License,
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at our web site.
#
# See the License for the specific language governing permissions and
# limitations under the License.
#
# $Author$
# $Date$
# $Revision$
```

---

## 4. Writing test cases

### 4.1 What to test, and what not

1. **Write unit tests only where they pay off.** A unit is worth its own unit tests when it:
   - changes frequently,
   - is core logic, or
   - has many edge cases or input combinations that the real flow tests would never exercise.

   Examples: revision numbering, task-tree parsing/serialization, permission rules, price/points calculation. Simple glue code, views that only pass data through, and one-line helpers get no unit tests. The end-to-end flow covers them.
2. **Remove tests covered by other tests.** If test A passing implies test B passes, B is redundant; delete it or fold its unique assertions into A. Examples:
   - The core flow already logs in through the form, so a separate "login page works" test is redundant.
   - "create checklist then finish it" covers "create checklist".

   Keep a smaller test only when it checks something the bigger one doesn't (a different branch, input or error path).
3. **Tests follow real use-case flows.** Build scenarios from what users actually do, in the order they do it (log in → open → start → tick → finish), with realistic data. Don't build artificial sequences that no user can produce. Error cases are the errors real users hit (missing required item, no permission, someone else's checklist), not every theoretical bad input. Exhaustive inputs belong in unit tests (rule 1).
4. **DRY the test foundation.** Setup, login, data seeding, browser driver, waits and verification helpers live in shared base classes and mixins (`BrowserTestBase`, `IMAPMixin`, a `ChecklistTestBase` with `createChecklist()` / `startWork()` helpers, ...). New tests extend them; they don't copy setup code or reinvent a driver. When two tests repeat the same steps, move the steps into the base. FileShare's `UploadTestBase` and `runCompleteUploadFlow` show the target: test files stay a few lines long.
   
   **Don't over-modularize the foundation.** Keep it to a few files: a generic browser base, page objects (one class per screen), and one domain test base. Test data specs and seeding belong in the domain test base, not in their own module or factory class. Split a file only when it has grown large or is shared by independent test packages.

### 4.2 Test structure

- One `TestCase` class per flow, view, endpoint or unit. One scenario per method, with a short docstring.
- Use `reverse('urlName')`. Assert the status code, the response body **and** the resulting DB state.
- External systems with side effects (email, Kanban, payment, Sentry): use the real system when its test-account env variables are set, otherwise fall back to a mock or local substitute (§4.4). Never hard-code credentials, and never point tests at production data.
- **Bypassing auth for business-logic tests:** patch the decorated method with its `__wrapped__` original (FileShare's `NoPASETOAuthMixin` / `mockRequirePASETOAuth` in `tests/api/ViewsTest.py`). Keep at least one test that hits the real auth path.
- **Email:** real SMTP + IMAP when configured (§4.4). Otherwise use the file-based email backend (`EMAIL_BACKEND='django.core.mail.backends.filebased.EmailBackend'`) and read the generated file (`tests/main/LoginTest.py`).
- **Regression tests (不貳過):** name the test after the broken behavior and mention the ticket/bug in the docstring, e.g. `"""Regression: finishing a checklist dropped notes (ticket #1234)."""`. Always follow the red → green process in §4.3.

### 4.3 Fixing a bug: red first, then green

A bug fix is only trusted when a test has shown the bug **and** shown the fix. Follow these steps in order, and don't skip or reorder them:

1. **Red: reproduce the bug with a test, before touching production code.**
   - Write a test that asserts the *correct* behavior for the reported scenario. Use the smallest input that triggers it, at the level where it shows: unit, view/API, or the core flow.
   - Run it and **confirm it fails**. Then read the failure: it must fail *for the reason in the bug report*, as an `F` whose assertion shows the wrong value/status/DB state.
     - An `E` caused by a typo, a missing fixture or a wrong URL name does **not** count as reproduced. Fix the test and run it again.
   - If the test passes right away, you have **not** reproduced the bug. Don't fix anything yet. Adjust the scenario (data, user, permissions, settings, order of steps) until it goes red, or report that you could not reproduce it.
   - Record the red run, i.e. the command and its failure output, in your report, commit message or ticket.
2. **Fix the production code.** Make the smallest change that addresses the cause. Do not change the test's assertion to match the buggy behavior.
3. **Green: run the same test again and confirm it passes.** That proves the fix works for the reproduced case.
4. **Run the surrounding tests** (the module's test file plus the core end-to-end test) to make sure the fix broke nothing else.
5. **Keep the test permanently.** It is now the regression guard (不貳過).

```bash
# 1. Red: must FAIL, for the reason described in the bug
python manage.py test tests.main.ViewsTest.CheckChecklistTest.testFinishKeepsNotes
#    FAIL: testFinishKeepsNotes ... AssertionError: 0 != 1 : Note should be saved when finishing

# 2. Fix main/views.py (or main/models.py)

# 3. Green: the same command must now PASS
python manage.py test tests.main.ViewsTest.CheckChecklistTest.testFinishKeepsNotes

# 4. No collateral damage
python manage.py test tests.main.ViewsTest tests.CoreFlowTest
```

```python
class CheckChecklistTest(TestCase):

    def testFinishKeepsNotes(self):
        """Regression: notes typed before pressing Finish were lost (ticket #1234)."""
        ...
        self.client.post(url, {'saveOrFinished': 'Finished', 'finish': leafIds,
                               'hiddenNote': [str(taskId)], 'note': ['checked by QA']})

        self.assertEqual(
            Note.objects.filter(userChecklistDetail=run, task_id=taskId).count(), 1,
            "Note should be saved when finishing"
        )
```

(The scenario above is illustrative, not a known Checklist bug.)

When reporting a bug fix, an agent must state both results: "red: reproduced with `<test>` (failure: `<message>`)" and "green: `<test>` passes after the fix, `<suite>` still passes". A fix reported without a red run is unverified.

### 4.4 Real external systems, gated by env variables

Credentials for real test accounts come only from env variables. CI sets them; a developer machine may not. Every such test checks whether they are present. If they are, it runs **for real**; if not, it falls back to the local substitute. Reference: `TrialIMAPMixin` in FileShare `tests/trial/TrialTest.py`.

```python
class IMAPMixin:
    imapEnvironmentNames = ('FFL_TEST_EMAIL', 'FFL_TEST_IMAP_HOST', 'FFL_TEST_IMAP_PASSWORD')

    @classmethod
    def hasIMAPConfiguration(cls):
        return all(os.environ.get(name) for name in cls.imapEnvironmentNames)

    def waitForEmail(self, subject, expectedContent, timeout=300):
        """Poll the real INBOX (IMAP4_SSL, FFL_TEST_IMAP_PORT default 993) until a matching mail arrives."""
        ...

# In the test:
imapEnabled = self.hasIMAPConfiguration()
recipient = os.environ['FFL_TEST_EMAIL'] if imapEnabled else f'recipient-{uuid.uuid4().hex}@example.com'
# imapEnabled: override EMAIL_BACKEND to the real SMTP backend, then waitForEmail(...)
# otherwise:   keep the file-based backend and read the newest file in EMAIL_FILE_PATH
```

Rules:
- Match the email by something unique to this test run (a generated link, token or uuid), not just the subject. The inbox is shared and may already contain old mail.
- Don't filter on `UNSEEN`; a mail client may already have marked the message read.
- Name new env variables `<PRODUCT>_TEST_<THING>` (e.g. `CHECKLIST_TEST_KANBAN_URL`) and list them in the project's `CLAUDE.md`/`AGENTS.md` and in the CI job.

### Example: house style (from `tests/api/ViewsTest.py`; see also `tests/main/ServiceTest.py` for mocking)

```python
class UserInformationAPITest(TestCase):
    """Test cases for UserInformationAPI"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='test@example.com', email='test@example.com', first_name='Test User'
        )
        self.registration = Registration.objects.create(serialNumber='TEST1234', user=self.user, level=1)
        UserPointsRecord.objects.create(user=self.user, points=150, change=150)

    def testUserInformationAPISuccess(self):
        """Test successful user information retrieval"""
        url = reverse('userInformationAPI', kwargs={'serialNumber': 'TEST1234'})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['result'])
        self.assertEqual(response.data['points'], 150)

    def testUserInformationAPISerialNumberNotFound(self):
        """Test user information with non-existent serial number"""
        url = reverse('userInformationAPI', kwargs={'serialNumber': 'NONEXIST'})
        response = self.client.get(url)

        self.assertFalse(response.data['result'])
        self.assertIn('not registered', response.data['message'])
```

---

## 5. The focused end-to-end test

Every project needs **one** fast end-to-end test that walks the product's main flow from start to finish, through the same entry point a real user uses. For a web app that means **a real browser** against a live server. FileShareServer's main client is a CLI, so its core test, `tests/CoreUploadTest.py`, drives the real client; its browser parts (download pages, branding, custom domains) are tested with Selenium. The structure is the same either way:

```python
class CoreUploadTest(UploadTestBase):
    """
    Core upload testing for rapid development cycles
    Tests only essential push and pull mode functionality
    Use this for quick validation during refactoring
    """

    def testPushModeCore(self):
        """Quick validation of push mode upload functionality"""

        async def runTest():
            result = await self.runSingleUploadWithMode(mode="push", fileKey="small", retentionPeriod="3 hours")

            self.assertTrue(result['canUpload'], "Push mode should allow small file upload")
            self.assertTrue(result['verified'], "Push mode small file verification failed")
            self.assertEqual(result['stage'], 'completed', "Push mode small file should complete successfully")

        asyncio.run(runTest())
```

How it is built:
- **The test file stays tiny.** All the mechanics live in a base class (`UploadTestBase`, built on `StaticLiveServerTestCase`), which gives:
  - `setUpClass`/`tearDownClass` to start and stop real servers or workers.
  - `setUp` to create a user, test data and a temp dir, with cleanup registered via `addCleanup`.
  - Flow helpers: `runCompleteUploadFlow` does every step in order (predicate → tell → upload → commit → end → download → verify) and returns a result dict with a `stage` field showing how far it got.
  - Verification helpers: `verifyDownloadRecord`, `verifyUserPointsDeduction`.
  - Readable logging: `log()`, `logTestStart()`, `logTestEnd()`.
- **It uses the real client.** `tests/TestClient.py` is the same kind of client a customer uses, run against `self.live_server_url`. Nothing in the main flow is mocked. Browser flows use a Selenium driver in the same position.
- **It covers few paths.** The happy path, one variant (push/pull), and one basic error case. Exhaustive scenarios belong in the larger suites (`UploadTest.py`), which reuse the same base class.
- **Every assertion has a message** saying what should have happened.
- **It can be run alone:** `python manage.py test tests.CoreUploadTest`.

Browser tests reuse `BrowserDriverMixin` from `tests/BrowserTestBase.py`: Chrome via `undetected_chromedriver` or Firefox via geckodriver, headless unless `TEST_HEADLESS=False`, with retries when a driver session fails to start. Copy it into the new project instead of writing a driver setup from scratch.

Browser test rules:
- Run on `StaticLiveServerTestCase` (a real server, real static files) and navigate with `driver.get(self.live_server_url + reverse(...))`.
- Log in through the real login form, not `force_login`, at least in the core test. Other browser tests may inject a session cookie to save time (FileShare: `_injectSessionCookie`).
- Wait with `WebDriverWait(...).until(EC...)`. Never use fixed `time.sleep()` for page loads.
- Find elements by stable `id`/`name`. If the template has none, add an `id` to the template instead of using brittle XPath.
- Assert what the user sees (page text, messages, element state) **and** the resulting DB state.
- Quit the driver in `tearDown`/`addCleanup`, even when the test fails.

### Applying it to Checklist

Checklist's tests are the reference implementation of this guide. They are split into layers, one concern each:

| File | Concern |
|---|---|
| `tests/BrowserTestBase.py` | `BrowserDriverMixin` (Chrome via `undetected_chromedriver`, Firefox via Selenium Manager), `Browser` (waits before every interaction), `BrowserTestBase` (live server, one driver per class, `loginWithSession`) |
| `tests/Pages.py` | Page objects: one class per screen owns its selectors and user actions; `TaskTreeEditor` is shared by the create and edit pages |
| `tests/ChecklistTestBase.py` | `TaskSpec` (a task tree as data); `ChecklistTestBase`: test user and category, temporary `MEDIA_ROOT`, `createChecklist` (ORM seeding) / `startWork` / `latestRun` |
| `tests/CoreFlowTest.py` | The focused end-to-end test |
| `tests/main/ViewsTest.py` | Further real user flows of `main/views.py` |

Tests then read as the user flow:

```python
class CoreFlowTest(ChecklistTestBase):

    def testCreateWorkFinishCore(self):
        """A user builds a 3-level checklist in the editor, works through it and finishes it."""
        LoginPage(self.browser).login(self.user, self.PASSWORD)
        CreateChecklistPage(self.browser).create(self.TITLE, self.CATEGORY, self.TASKS)
        ...
        userChecklistPage = ChecklistsPage(self.browser).openChecklist(self.TITLE).startToWork()
        userChecklistPage.tick(*leafTitles)
        userChecklistPage.finish()

        run = self.latestRun(Checklist.objects.get(checklistdetail=checklistDetail))
        self.assertEqual(run.status, FINISHED, "Run should be finished when every required item is ticked")
```

New tests extend `ChecklistTestBase` and add any missing user action to the page object of that screen, not to the test.

API tests are separate. Once a JSON API exists (e.g. for MCP), test each endpoint with the Django `Client` in `tests/<app>/ViewsTest.py`. Kanban integration tests follow §4.4: they use a real Kanban test board when its env variables are set, and otherwise mock `requests` in `main.views`.

---

## 6. Test infrastructure

### `testall` (Iuppiter)

`python manage.py testall` is the full test run. It needs `'Iuppiter.test'` in `INSTALLED_APPS`; check with `python manage.py help | grep testall`. `Iuppiter.test.Runner.TestRunner`:
- Discovers every `*Test.py`. This is why the file-name suffix matters.
- Uses `settings.TEST_RUNNER` if set; the runner must inherit `xmlrunner.extra.djangotestrunner.XMLTestRunner`, or it falls back to the default `XMLTestRunner`. `--runner` overrides it.
- Writes JUnit XML to `tests/test-reports/`. `--coverage` adds a coverage report in `tests/test-reports/coverage/`.
- Runs `--pylint`, `--jslint` and `--eslint` as extra quality checks.
- Force-exits at the end so leftover threads can't hang CI.

### `tests/__init__.py`

FileShareServer keeps its test runner and shared helpers in `tests/__init__.py`, and wires the runner in with `TEST_RUNNER = 'tests.ForceExitTestRunner'` in settings. It:
- Extends `xmlrunner.extra.djangotestrunner.XMLTestRunner` so CI (Jenkins) gets JUnit XML in `tests/test-reports/`.
- Forces the file-based email backend for all tests (`tests/emails/`).
- Uses a file-based SQLite test DB in the temp dir (`configureTestDatabase`). It also writes dynamic settings for any subprocess that needs the same DB (`writeDynamicTestSettings`).
- Copies `fixtures/initial_data.json` into a per-class fixture (`copyInitialDataFixture('ClassName')`), used as `fixtures = [...]`.
- Force-exits after teardown (`Iuppiter.test.Runner.TestRunner.forceExit()`) and kills leftover child processes, so background threads or servers can't hang the run.

For a new project, **start minimal**: an `XMLTestRunner` subclass is enough. Add the other pieces only when a real need shows up, e.g. background threads that keep the process alive or subprocesses that need the test DB.

**One piece is always needed with SQLite and browser tests: a file-based test DB.** With the default in-memory test DB, Django shares one SQLite connection between the live server's request threads. Pages that fire parallel AJAX requests then break each other's queries, and tests fail intermittently in random places. In Checklist, a session lookup missed and the user was suddenly redirected to login. See `ChecklistTestRunner` in Checklist's `tests/__init__.py` (or FileShare's `configureTestDatabase`). A flaky browser test is a bug to diagnose with evidence, never something to retry until it passes.

Test-only dependencies go in `REQUIREMENTS_TEST.txt` (e.g. `unittest-xml-reporting`, `coverage`, `pylint`, `selenium`, `undetected_chromedriver`, `get-gecko-driver`, `httpx`).

---

## 7. Running tests

```bash
# One module / class / method
python manage.py test tests.CoreFlowTest
python manage.py test tests.main.ViewsTest.CreateChecklistTest
python manage.py test tests.main.ViewsTest.CreateChecklistTest.testCreateChecklistSuccess

# Full run (what "all tests pass" means)
python manage.py testall

# Browser tests with a visible browser
TEST_HEADLESS=False python manage.py test tests.SomeBrowserTest      # PowerShell: $env:TEST_HEADLESS="False"
```

CI (Jenkins) runs the full suite with real external systems enabled, e.g. for FileShareServer:

```bash
export CHROME_DRIVER_VERSION=154               # pin chromedriver to the CI machine's Chrome
# Real email end-to-end tests (OTP etc.)
export FFL_TEST_EMAIL='test@nuwainfo.com'
export FFL_TEST_IMAP_HOST='mx.nuwainfo.com'
export FFL_TEST_IMAP_PASSWORD='<from Jenkins credentials>'
export FFL_TEST_IMAP_PORT=993                  # optional, defaults to 993
python manage.py testall --pylint --jslint --coverage
```

Notes on `testall`:
- On a Windows console with a non-UTF-8 code page (e.g. cp950), set `PYTHONUTF8=1` (PowerShell: `$env:PYTHONUTF8=1`). Otherwise Iuppiter's emoji output raises `UnicodeEncodeError`, which its runner swallows as "Not in Django environment", and every test errors without a test DB.
- `testall` exits 0 even when tests fail. Read the summary line or the JUnit XML in `tests/test-reports/`.

Before reporting a change as done, run the affected tests plus the core end-to-end test. Before a release or a large refactor, run `testall`. If you could not run `testall` (or ran it without the real-system env variables), say so explicitly.

---

## 8. Bootstrapping tests in a project without tests

Do these in order. Stop and report if a step uncovers a real bug. A failing test that reveals one is a valid outcome; don't "fix" the test to make it pass.

1. **Read the project:** `CLAUDE.md`/`AGENTS.md`, `urls.py`, models, the main views. Identify the core user flow.
2. **Create the skeleton:** `tests/__init__.py`, `tests/<app>/__init__.py`, `REQUIREMENTS_TEST.txt`. Add `'Iuppiter.test'` to `INSTALLED_APPS` if missing, and make sure `python manage.py testall` runs (0 tests is fine). Check that the test DB works with the project's DB settings. Framework-injected settings (e.g. `Iuno.attachSettings`) may choose the DB.
3. **Write the focused end-to-end browser test** (§5): copy `BrowserDriverMixin`, add `selenium`/`undetected_chromedriver`/`get-gecko-driver` to `REQUIREMENTS_TEST.txt`, and make the test pass against the current code.
4. **Write tests for the code you are about to change** (refactor targets, new API endpoints) before changing it. Extend the shared bases, follow real use cases, and skip anything already covered (§4.1).
5. **For every bug found, follow red → green** (§4.3): reproduce it with a failing test first, then fix it and see the same test pass. The test stays as the regression guard (不貳過).
6. **Document the commands** in the project's `CLAUDE.md` / `AGENTS.md`.

Don't:
- Mass-generate shallow tests for every file just to raise coverage, or add tests already implied by another passing test.
- Copy setup/driver/login code into a new test instead of extending the shared base.
- Fix a bug before its test has gone red, or count an error (`E`) from a broken test as "reproduced".
