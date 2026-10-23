# Clean Code Principles

This document provides detailed clean code guidelines for software projects. These principles should be followed alongside any repository-specific style and architecture guidelines.

## Core Principles
- **Naming Convention**: Use camelCase for variables, functions, methods, and dict keys (e.g., `getUserName()`, `itemCount`, `taskRunner`, `{'itemName': ..., 'itemCount': ...}`). Exceptions: JSON config files on disk use snake_case keys; URL query parameters use snake_case. See Rule 18 for the full breakdown.
- **HTML/CSS/DOM Naming**: Use camelCase or kebab-case for HTML ids, CSS classes, data attributes, and JS DOM selectors. Do not use snake_case in HTML ids or CSS selectors. Examples: `requestCode`, `contact-email-field`, `dialogConfirm`, `validation-error-message` are acceptable; `request_code` or `validation_error_message` are not.
- **Acronym Casing**: Acronyms and initialisms must be either ALL CAPS or all lowercase — never any other mixed form (`Ssl`, `sSL`, `Http`, `hTTP` are all wrong). The rule is:
  - **Acronym is the very first semantic word** of the identifier (leading `_` does not count as a word): use all lowercase, because camelCase identifiers start lowercase (e.g., `sslCtx`, `httpClient`, `self._sslCtx`)
  - **Any other position** — i.e., any other word precedes the acronym: use ALL CAPS (e.g., `getSSLContext`, `warmSSLContext`, `parseHTTPHeader`, `_sharedSSLCtx`, `_getSharedSSLCtx`, `otpAPIBase`). Even one word before the acronym means ALL CAPS: `_sharedSSLCtx` is correct, `_sharedSslCtx` is wrong because "shared" and "SSL" are two different words.
  - **Standalone** (module-level name, `import ssl`): all lowercase
  - Never write `Ssl`, `Http`, `Api`, `Url`, or any other partial-caps form in any position.
- **Throwaway Variables**: Avoid `_` as a throwaway variable when the codebase reserves `_` for translation or another shared convention. Prefer `_i`, `_unused`, or a descriptive name instead.
- **DRY Principle**: Don't Repeat Yourself - avoid code duplication and create reusable functions/classes
- **Class Design**: Prefer encapsulation - move related functionality into appropriate classes rather than using global functions
- **Dependencies**: Do not use inner/local imports to dodge circular dependencies. Inner imports are not an acceptable workaround for bad module boundaries. Fix the dependency graph instead: move shared abstractions/constants to a neutral module, or refactor responsibilities so imports stay one-directional.
- **Function Naming**: Public functions and methods should use descriptive camelCase names. Internal/private/protected helpers and attributes may use a leading underscore when that better communicates encapsulation (for example, `_cleanupState()` or `_cachedConfig`).
- **Error Reporting**: Route reportable exceptions through the project's centralized error-reporting mechanism instead of calling external reporting services ad hoc
- **Logging**: Use the project's shared logger factory with appropriate module names and contextual metadata
- **Code Organization**: Keep related state and methods together in classes for better maintainability
- **Event Naming**: Use RESTful convention for events (e.g., `/cli/arguments/create`, `/config/settings/update`)
- **REST URLs**: New or modified HTTP/UI routes must name a resource, never a command, action, or implementation detail. Use nouns and resource hierarchy (for example, `PUT /reports/composer/template` or `PUT /reports/composer`), not action-style paths such as `/build-report`, `/advanced-panel`, or `/create`. Express the operation through the HTTP method.
- **Property Access**: Use @property decorators instead of getter methods (e.g., `user` property vs `getUser()`)
- **Singleton Pattern**: If a singleton lifecycle is required, use the project's shared singleton abstraction and explicit initialization hook instead of creating ad-hoc singleton implementations
- **Configuration**: Store settings in JSON files with clear structure and fallback handling
- **Error Handling**: Do not over-defensively add try/except everywhere - if a function/method should raise an exception, let it raise. Never hide errors in a function/method

---

## 1. Early Returns - Avoid Deep Nesting
**DO**: Use early returns to reduce nesting and improve readability
```python
def processRequest(data):
    if not data:
        return {'error': 'Missing data'}

    if not data.get('email'):
        return {'error': 'Missing email'}

    # Continue with main logic
    return processEmail(data['email'])
```

**DON'T**: Use deep nested if/else chains
```python
def processRequest(data):
    if data:
        if data.get('email'):
            # Main logic buried deep
            return processEmail(data['email'])
        else:
            return {'error': 'Missing email'}
    else:
        return {'error': 'Missing data'}
```

## 2. Fail Fast - No Silent Fallbacks
**DO**: Raise exceptions for illegal/impossible states to enable easier debugging
```python
def handleUserState(user, state):
    if not user:
        raise ValueError('User cannot be None')

    if state not in ['active', 'inactive', 'pending']:
        raise ValueError(f'Invalid state: {state}')

    # Continue with valid state
```

**DON'T**: Add fallbacks that hide real problems
```python
def handleUserState(user, state):
    if not user:
        user = getDefaultUser()  # Masks the real issue

    if state not in ['active', 'inactive', 'pending']:
        state = 'active'  # Hides configuration errors
```

## 3. Unified Logic - Single Code Path
**DO**: Write single, unified logic that handles variations through parameters
```python
def generateSessionToken(email, deviceId, nonce):
    # Single implementation used everywhere
    return createToken(email, deviceId, nonce)

def handleAuthentication(deviceData):
    if 'lastLogin' not in deviceData:
        return {'status': 'pending'}

    # Single path to generate tokens
    token = generateSessionToken(deviceData['email'], deviceData['deviceId'], generateNonce())
    return {'status': 'authenticated', 'token': token}
```

**DON'T**: Duplicate similar logic with slight variations
```python
def generateWebSessionToken(email, deviceId):  # Duplicate logic
    return createToken(email, deviceId, generateNonce())

def generateCliSessionToken(email, deviceId):  # Nearly identical
    return createToken(email, deviceId, generateNonce())

def handleWebAuth(deviceData):  # Copy-paste with variations
    token = generateWebSessionToken(deviceData['email'], deviceData['deviceId'])
    return {'status': 'authenticated', 'sessionToken': token}

def handleCliAuth(deviceData):  # More copy-paste
    token = generateCliSessionToken(deviceData['email'], deviceData['deviceId'])
    return {'status': 'authenticated', 'token': token}
```

## 4. Eliminate Useless Conditions
**DO**: Structure code to minimize branching and eliminate redundant checks
```python
def processDeviceState(deviceId):
    deviceData = deviceKeys.get(deviceId)
    if not deviceData:
        return {'status': 'not_found'}

    if 'email' not in deviceData:
        return {'status': 'pending_email'}

    if 'lastLogin' not in deviceData:
        return {'status': 'pending_otp'}

    # Single success path
    return generateSuccessResponse(deviceData)
```

**DON'T**: Use complex if/elif/else chains that repeat logic
```python
def processDeviceState(deviceId):
    if deviceId in deviceKeys:
        deviceData = deviceKeys[deviceId]
        if deviceData:
            if 'email' in deviceData:
                if 'lastLogin' in deviceData:
                    return generateSuccessResponse(deviceData)  # Buried deep
                else:
                    return {'status': 'pending_otp'}
            else:
                return {'status': 'pending_email'}
        else:
            return {'status': 'pending_email'}
    else:
        return {'status': 'not_found'}
```

## 5. No Code Duplication
**DO**: Extract common functionality into reusable functions
```python
def createAuthResponse(email, deviceId, status='authenticated'):
    """Single function for all authentication responses"""
    nonce = generateNonce(email, deviceId)
    sessionToken = generateSessionToken(email, deviceId, nonce)
    publicKey = getServerPublicKey()
    voucher = generateVoucher(sessionToken, publicKey)

    return {
        'status': status,
        'sessionToken': sessionToken,
        'operationalPublicKey': publicKey,
        'voucher': voucher,
        'email': email
    }

# Used everywhere consistently
def handleWebAuth(deviceData):
    return createAuthResponse(deviceData['email'], deviceData['deviceId'])

def handleCliAuth(deviceData):
    return createAuthResponse(deviceData['email'], deviceData['deviceId'])
```

**DON'T**: Copy-paste blocks with minor variations
```python
# Bad: Duplicated response generation
def handleWebAuth(deviceData):
    nonce = generateNonce(deviceData['email'], deviceData['deviceId'])
    sessionToken = generateSessionToken(deviceData['email'], deviceData['deviceId'], nonce)
    publicKey = getServerPublicKey()
    voucher = generateVoucher(sessionToken, publicKey)
    return {
        'status': 'authenticated',
        'sessionToken': sessionToken,  # Different key name
        'operationalPublicKey': publicKey,
        'voucher': voucher,
        'email': deviceData['email']
    }

def handleCliAuth(deviceData):  # Nearly identical copy-paste
    nonce = generateNonce(deviceData['email'], deviceData['deviceId'])
    sessionToken = generateSessionToken(deviceData['email'], deviceData['deviceId'], nonce)
    publicKey = getServerPublicKey()
    voucher = generateVoucher(sessionToken, publicKey)
    return {
        'status': 'authenticated',
        'token': sessionToken,  # Slightly different key name
        'serverPublicKey': publicKey,  # Different key name
        'voucher': voucher
    }
```

## 5.5 Reuse Data Mapping Instead of Copying Fields

When converting between a dict, dataclass, model, or view model, do not manually copy every same-named field. Reuse the existing mapping mechanism (`fromDict()`, `fromObject()`, serializer, ORM mapper, or a shared mapper) and specify only the fields whose names or values genuinely differ.

**DO**: inherit the reusable mapper and override only the exceptional mapping
```python
@dataclass(frozen=True)
class HistoryShareView(DataclassDictMixin):
    id: str
    name: str
    downloads: int

    @classmethod
    def fromDict(cls, shareData):
        return super().fromDict(shareData, downloads=shareData['downloadCount'])
```

**DON'T**: retype a one-to-one field list merely to construct the target object
```python
@classmethod
def fromDict(cls, shareData):
    return cls(
        id=shareData['id'],
        name=shareData['name'],
        downloads=shareData['downloadCount'],
        # ...every other unchanged field copied by hand
    )
```

**Exception**: explicit field-by-field construction is acceptable only when the source and target have materially different semantics, require validation/transformation for most fields, or no reusable mapping abstraction can express the conversion clearly. In that case, put the transformation in the class or mapper that owns it, rather than duplicating it across callers.

**Key Rule**: For mostly identical data shapes, the code should declare differences, not repeat similarities.

---

## 6. Clear State Logic
**DO**: Make state transitions obvious and linear
```python
def checkAuthenticationState(deviceId):
    """Clear state checking with obvious flow"""
    if not deviceKeys.get(deviceId):
        return 'no_session'

    deviceData = deviceKeys[deviceId]

    if not deviceData:  # Empty dict
        return 'awaiting_email'

    if 'email' in deviceData and 'lastLogin' not in deviceData:
        return 'awaiting_otp'

    if 'lastLogin' in deviceData:
        return 'authenticated'

    raise RuntimeError('Invalid device state - should not reach here')
```

**DON'T**: Mix different logic paths and conditions
```python
def checkAuthenticationState(deviceId):
    """Confusing mixed logic"""
    if deviceId in deviceKeys:
        deviceData = deviceKeys[deviceId]
        if deviceData and 'email' in deviceData:
            if 'lastLogin' in deviceData:
                return 'authenticated'
            else:
                return 'awaiting_otp'
        elif not deviceData:
            return 'awaiting_email'
        else:
            return 'awaiting_email'
    else:
        return 'no_session'
```

## 7. Avoid String-Based Logic Control
**DO**: Use data presence and types to determine behavior
```python
class AuthPoller:
    def __init__(self, serverUrl, deviceId, clientVersion, token=None, email=None):
        self.token = token
        self.email = email

    def run(self):
        # Determine behavior based on data presence, not strings
        if self.token and self.email:
            # OTP verification phase
            result = self.pollOtpVerification()
        else:
            # Email input phase
            result = self.pollEmailInput()

    def pollOtpVerification(self):
        # Look for actual completion data
        if 'sessionToken' in result:
            return result  # Authentication complete
        return None  # Keep polling

    def pollEmailInput(self):
        # Look for actual transition data
        if 'email' in result and 'queryToken' in result:
            return result  # Email received
        return None  # Keep polling
```

**DON'T**: Use string status/message values for control flow
```python
class AuthPoller:
    def __init__(self, authDemo, phase='email', **kwargs):  # Bad: string phase
        self.phase = phase

    def run(self):
        # Bad: string-based branching
        if self.phase == 'email':
            result = self.pollEmailPhase()
        elif self.phase == 'otp':
            result = self.pollOtpPhase()

    def pollEmailPhase(self):
        status = result.get('status')
        # Bad: string status checking
        if status == 'pending':
            return None
        elif status == 'ready':
            return result
```

## 8. Generic Output Capture Pattern
**DO**: Use the generic `captureOutputIn` parameter with `_updateCapturedOutput()` for dynamic output capture
```python
def testMethod(self):
    """Test that needs to examine process output after operations"""
    outputCapture = {}
    shareLink = self._startFastFileLink(p2p=True, captureOutputIn=outputCapture)

    # ... perform test operations (browser download, etc.) ...

    # Update captured output with latest process output
    outputText = self._updateCapturedOutput(outputCapture)
    if "Expected Pattern" not in outputText:
        raise AssertionError("Expected pattern not found in output")
```

**DON'T**: Duplicate output reading logic in each test class
```python
def testMethod(self):
    """Bad: Duplicated output reading logic"""
    shareLink = self._startFastFileLink(p2p=True)

    # Bad: Manual process termination and output reading
    if self.coreProcess and self.coreProcess.poll() is None:
        self.coreProcess.terminate()

    # Bad: Duplicated file reading logic
    outputText = ""
    if self.procLogPath and os.path.exists(self.procLogPath):
        with open(self.procLogPath, "r") as f:
            outputText = f.read()

    # Pattern checking...
```

## 9. No Unnecessary Defensive Programming
**DO**: Trust your object initialization and use direct attribute access
```python
class TestBase:
    def __init__(self):
        self._procLogFile = None
        self.procLogPath = os.path.join(self.tempDir, "proc.log")

    def cleanup(self):
        # Direct access - we know these attributes exist
        if self._procLogFile:
            self._procLogFile.close()
            self._procLogFile = None
```

**DON'T**: Use unnecessary `getattr()` or `hasattr()` when attributes/methods are guaranteed to exist
```python
def cleanup(self):
    # Bad: unnecessary defensive programming
    if getattr(self, "_procLogFile", None):
        self._procLogFile.close()

    # Bad: checking for attributes we initialize in __init__
    if hasattr(self, "procLogPath"):
        os.unlink(self.procLogPath)

def showVersion(featureManager):
    # Bad: checking for methods when interface guarantees they exist
    if hasattr(featureManager, 'checkCompatibility'):
        result = featureManager.checkCompatibility()
```

**Trust Interfaces and Polymorphism**: When using interface-based design (like FeatureManager/DummyFeatureManager), trust that all implementations provide the required methods:
```python
def showVersion(featureManager):
    # Good: trust the interface - all FeatureManager implementations have checkCompatibility
    result = featureManager.checkCompatibility()

def processManager(manager):
    # Good: trust the interface contract
    manager.start()
    manager.process()
    manager.cleanup()
```

## 10. Proper Argument Parser Usage
**DO**: Trust argparse - arguments defined with `add_argument()` always exist on args object
```python
# Parser definition
parser.add_argument("--pause", type=int, metavar="PERCENTAGE")
parser.add_argument("--upload", choices=['6 hours', '1 day'], nargs='?', const='6 hours')
parser.add_argument("--max-downloads", type=int, default=0, dest="maxDownloads")
parser.add_argument("--force-relay", action="store_true", default=False, dest="forceRelay")

# Usage - direct access (GOOD)
def processArgs(args):
    pausePercentage = args.pause           # None if not provided (no default)
    uploadDuration = args.upload           # None if not provided
    maxDownloads = args.maxDownloads       # 0 if not provided (default=0)
    forceRelay = args.forceRelay           # False if not provided (default=False)

    if args.pause is not None:             # Direct check
        validatePausePercentage(args.pause)

    if args.upload:                        # Direct truthiness check
        startUpload(args.upload)
```

**DON'T**: Use unnecessary `getattr()` or `hasattr()` with argparse objects
```python
# Bad: unnecessary defensive programming with argparse
def processArgs(args):
    pausePercentage = getattr(args, 'pause', None)        # ANTIPATTERN - args.pause already None if not provided
    uploadDuration = getattr(args, 'upload', None)        # ANTIPATTERN - args.upload already None if not provided
    maxDownloads = getattr(args, 'maxDownloads', 0)       # ANTIPATTERN - args.maxDownloads already 0 (default=0)
    forceRelay = getattr(args, 'forceRelay', False)       # ANTIPATTERN - args.forceRelay already False (default=False)

    if hasattr(args, 'pause') and args.pause is not None: # ANTIPATTERN - args.pause always exists
        validatePausePercentage(args.pause)

    if hasattr(args, 'upload') and args.upload:           # ANTIPATTERN - args.upload always exists
        startUpload(args.upload)
```

**Argparse Guarantees**: Once arguments are defined with `parser.add_argument()`, they **always exist** on the args object:
- **With user values** when provided
- **With default values** when `default=` is specified
- **As None** when no default specified and user doesn't provide them
- **As False** for `action="store_true"` when not provided
- **As True** for `action="store_false"` when not provided

**Key Rule**: Never use `getattr(args, 'argument', default)` or `hasattr(args, 'argument')` with argparse - it implies uncertainty that doesn't exist.

## 10.5 Never Add Internal Dynamic Attributes to Unrelated Objects
**DO**: Keep internal caches and coordination state inside the class/module that owns the mechanism
```python
class HookEndpointRouter:
    _routesByServer = weakref.WeakKeyDictionary()

    @classmethod
    def getRoutesForServer(cls, server):
        routes = cls._routesByServer.get(server)
        if routes is None:
            routes = cls._fetchRoutes(server)
            cls._routesByServer[server] = routes
        return routes
```

**DON'T**: Attach ad-hoc internal attributes onto unrelated runtime objects
```python
# Bad: Hook internals leaking into server object state
server._hookRoutes = routes
server._hookCacheReady = True

# Bad: random dynamic state on handler instances
handler._myFeatureTempState = {}
```

**Why**:
- It is fragile and hard to discover
- It hides ownership of state
- It makes interfaces muddy by mixing feature internals into unrelated objects
- It increases collision risk with real attributes added later

**Key Rule**: Never add dynamic internal attributes to objects you do not own just to hold helper/cache state. Put that state in the mechanism's own class/module, or define a real declared attribute in the owning class.

## 11. Proper Error Handling - Let Exceptions Surface
**DO**: Let functions/methods raise exceptions when they should fail - don't hide errors
```python
def processData(data):
    # Let ValueError raise if data is invalid - caller should handle it
    result = validateData(data)  # May raise ValueError
    return processValidData(result)

def connectToDatabase(url):
    # Let ConnectionError raise - caller needs to know about connection issues
    connection = database.connect(url)  # May raise ConnectionError
    return connection
```

**DON'T**: Over-defensively catch exceptions and hide errors
```python
def processData(data):
    try:
        result = validateData(data)
        return processValidData(result)
    except ValueError:
        return None  # Bad: Hides the actual error, caller doesn't know why it failed

def connectToDatabase(url):
    try:
        connection = database.connect(url)
        return connection
    except ConnectionError:
        return None  # Bad: Caller can't distinguish between "no connection" and other issues
```

**Exception Guidelines:**
- **Business logic should raise exceptions** for invalid states or inputs
- **Only catch exceptions at the appropriate level** (usually at UI/API boundaries)
- **Use try/except only when you can meaningfully handle the error** or add context
- **Let exceptions bubble up** to the caller who can decide how to handle them
- **Add try/except at service boundaries** (CLI, API endpoints) to show user-friendly messages

## 12. Never Silently Suppress Exceptions
**DO**: Always log exceptions, even when you don't need to handle them - use appropriate logging levels
```python
# Good: Log expected/normal errors at debug level
try:
    context['outputFile'].close()
except Exception as e:
    logger.debug(f"Error closing file during cleanup: {e}")

# Good: Log cancellation events for debugging
try:
    await task
except asyncio.CancelledError:
    logger.debug(f"Task cancelled successfully: {task.get_name()}")
except Exception as e:
    logger.debug(f"Error during task cleanup: {e}")

# Good: Log expected conditions (404, etc.) at debug level
except urllib.error.HTTPError as e:
    if e.code == 404:
        logger.debug(f"Peer {peerId} already cleaned up (404) - this is expected")
    else:
        logger.warning(f"Failed to notify completion: HTTP {e.code}")
```

**DON'T**: Use `except: pass` antipattern - never silently suppress errors
```python
# Bad: Silent suppression - no way to debug issues
try:
    context['outputFile'].close()
except Exception:
    pass  # ANTIPATTERN - what if this fails for unexpected reasons?

# Bad: Silent suppression with comment - still no logging
try:
    await task
except asyncio.CancelledError:
    pass  # Task cancelled - but we don't know which task or when

# Bad: Empty finally block - remove it instead
try:
    performOperation()
except Exception as e:
    handleError(e)
finally:
    pass  # ANTIPATTERN - remove empty finally blocks
```

**Logging Level Guidelines:**
- **`logger.debug()`**: Expected errors (CancelledError, 404, normal cleanup failures)
- **`logger.info()`**: Informational messages about normal operations
- **`logger.warning()`**: Unexpected but recoverable errors (retry scenarios, fallback triggers)
- **`logger.error()`**: Serious errors that affect functionality
- **`logger.exception()`**: Use in exception handlers to include full traceback

**Key Rule**: Even if you can't or don't need to handle an exception, always log it for debugging purposes. Silent suppression makes troubleshooting nearly impossible.

## 13. Don't Use Exceptions for Control Flow
**DO**: Use explicit checks for expected conditions - exceptions are for exceptional situations
```python
# Good: Explicit check for expected condition
if '--upload' in argv:
    uploadIdx = argv.index('--upload')
    # Process upload argument

# Good: Check before accessing
if key in dictionary:
    value = dictionary[key]
    processValue(value)

# Good: Use get() with default for dictionaries
value = dictionary.get(key)
if value is not None:
    processValue(value)
```

**DON'T**: Use try/except to handle expected, normal cases
```python
# Bad: Using exception for control flow
try:
    uploadIdx = argv.index('--upload')
    # Process upload argument
except ValueError:
    pass  # --upload not in argv

# Bad: Using exception instead of checking
try:
    value = dictionary[key]
    processValue(value)
except KeyError:
    pass  # Key doesn't exist

# Bad: Exception for flow control
try:
    result = int(userInput)
except ValueError:
    result = defaultValue  # Use explicit check instead
```

**Exception Guidelines for Control Flow:**
- **Use `in` operator**: Check if item exists in list/dict before accessing
- **Use `.get()` method**: For dictionaries, use `.get(key, default)` instead of try/except KeyError
- **Use explicit validation**: Check conditions before operations rather than catching exceptions
- **Reserve exceptions for errors**: Use exceptions only for truly exceptional/error conditions
- **Performance matters**: Exception handling has overhead - don't use it for normal flow

**When Exceptions ARE Appropriate:**
- File I/O errors (file not found, permission denied)
- Network errors (connection failed, timeout)
- Invalid user input that should be rejected
- Programming errors (type errors, attribute errors)
- Truly unexpected conditions

**Key Rule**: If you can check a condition with a simple `if` statement, don't use try/except. Exceptions should indicate problems, not program flow.

## 14. JavaScript: Always Use Braces for Control Structures
**DO**: Always wrap the body of `if`, `else`, `for`, `while`, and similar constructs in curly braces, even for single statements
```javascript
// Good
if (a === 1) {
    alert(a);
}

if (isReady) {
    start();
} else {
    wait();
}

for (let i = 0; i < items.length; i++) {
    process(items[i]);
}
```

**DON'T**: Write one-line control structures — whether braces are missing or the body is crammed onto the same line as the header
```javascript
// Bad: missing braces
if (a === 1) alert(a);
if (isReady) start();
else wait();
for (let i = 0; i < items.length; i++) process(items[i]);

// Bad: braces present but compressed onto one line — still unreadable and hard to diff
if (!x) { return; }
if (data) { for (const [k, v] of Object.entries(data)) { body.append(k, v); } }
if (!result.success) { showError(result.error); return; }
```

**Why**: Brace-free one-liners are a common source of bugs — adding a second statement to the body silently falls outside the condition. Compressing braced blocks onto one line defeats the purpose: it makes structure hard to scan, diffs noisy, and code harder to extend safely.

**Key Rule**: Every control-structure body gets its own `{` `}` block on separate lines, no exceptions.

## 16. Enums — Always Use Members, Never Raw Values

**DO**: Define enums with integer values and always reference members by name
```python
class ShareStatus(IntEnum):
    CREATING = 1
    ONLINE = 2
    COMPLETED = 3
    STOPPED = 4
    CRASHED = 5

# Good: always use the member
session.status = ShareStatus.COMPLETED
if session.status == ShareStatus.ONLINE:
    ...
if session.status in (ShareStatus.STOPPED, ShareStatus.CRASHED):
    ...
```

**DON'T**: Use `str` enum (it makes raw-string comparisons silently pass) or assign/compare with raw values
```python
# Bad: str enum — bypass is invisible because 'completed' == ShareStatus.COMPLETED is True
class ShareStatus(str, Enum):
    COMPLETED = 'completed'

# Bad: raw string assignment — bypasses the enum entirely
session.status = 'completed'

# Bad: raw string comparison — typos are silent at runtime
if session.status == 'online':
    ...
```

**Serialization boundary**: enums must be serialized to/from their string name (`.name.lower()`) at API/JSON boundaries only. Inside Python code, always use the enum member.
```python
# Serializing for JSON/display
'status': session.status.name.lower()   # e.g. 'online'

# Deserializing from JSON
ShareStatus[value.upper()]              # e.g. ShareStatus['ONLINE']
```

**Key Rules**:
- Enum values must be **integers** (`IntEnum`) — never strings. This prevents the `str` subclass loophole where `status == 'completed'` silently bypasses enum checking.
- Never assign or compare with a raw value (`1`, `'online'`, etc.) — always use the named member (`ShareStatus.ONLINE`).
- Convert to/from strings only at serialization boundaries (JSON, REST API, display). All internal logic uses the enum member.

---

## 15. Encapsulate Helpers — No Scattered Free Functions

**DO**: Put constants and helpers inside the class that owns them. When multiple sibling classes share a helper, extract a common base class.
```python
class UserCustomDomainService(BaseService):
    _DOMAIN_NAME_RE = re.compile(r'^...$')
    _BLOCKED_SUFFIXES = ('fastfilelink.com',)

    def _validateDomainName(self, domainName):
        if not self._DOMAIN_NAME_RE.match(domainName):
            raise ValueError('Invalid domain name format')
        for blocked in self._BLOCKED_SUFFIXES:
            if domainName.endswith(f'.{blocked}'):
                raise ValueError('This domain cannot be registered')


class DomainBaseView(View):
    domainService = UserCustomDomainService.getInstance()

    def _dumpDomainJson(self, ucd):
        return {'domainName': ucd.domain.domainName, 'isVerified': ucd.isVerified, ...}


class DomainsView(DomainBaseView):
    def get(self, request):
        return JsonResponse({'domains': [self._dumpDomainJson(d) for d in self.domainService.list(request.user)]})
```

**DON'T**: Scatter module-level constants or free helper functions that belong to a specific class
```python
# Bad: module-level, only used by one class
_DOMAIN_NAME_RE = re.compile(r'^...$')
_BLOCKED_SUFFIXES = ('fastfilelink.com',)

# Bad: free function only used by view classes — belongs in a base view
def _domainJson(ucd):
    return {...}
```

**Rules**:
- Constants or helpers used by only one class → class attribute or private method
- Helpers shared across sibling classes → base class method
- Free functions are for truly standalone utilities with no class affiliation
- Methods and functions must be named as **verbs** (`_dumpDomainJson`, not `_domainJson`; `validateToken`, not `tokenValidator`)

---

## 17. `@classmethod` vs `@staticmethod`

Use `@classmethod` when a method calls sibling class methods, accesses class-level constants, or is conceptually part of the class's interface. Reserve `@staticmethod` for pure computational helpers that have no ties to the class — they could live as a standalone function and still make complete sense.

**DO**: Use `@classmethod` when the method calls other class methods or uses class constants
```python
class DaemonManager:
    STARTUP_TIMEOUT = 15

    @classmethod
    def handleCLICommand(cls, args) -> int:
        if args.daemonStop:
            return cls._stopDaemon()      # calls sibling method via cls
        return cls._startDaemon()

    @classmethod
    def _startDaemon(cls) -> int:
        deadline = time.time() + cls.STARTUP_TIMEOUT   # uses class constant via cls
        ...
        if DaemonClient.isRunning():
            ...

    @staticmethod
    def _forceKillDaemon() -> int:        # pure logic, no sibling calls, no class constants
        state = DaemonStateFile().load()
        ProcessHelper.kill(state['pid'])
        return 0
```

**DON'T**: Use `@staticmethod` for methods that call sibling class methods — it forces you to hard-code the class name and breaks subclassing
```python
# Bad: hard-coded class name, not overridable
@staticmethod
def handleCLICommand(args) -> int:
    if args.daemonStop:
        return DaemonManager._stopDaemon()   # fragile, won't honour subclasses
    return DaemonManager._startDaemon()
```

**Rules**:
- Default to `@classmethod` for any non-instance method in a class that has siblings or class constants
- Use `@staticmethod` only for helpers that are purely computational, reference no class attributes, and call no sibling methods — i.e., helpers that could be extracted to a module-level function without loss of clarity
- If in doubt, `@classmethod` is the safer choice

---

## 17.5 Method Ordering Inside Classes

Keep a class readable as a top-down declaration, even though Python does not require declarations before use.

**Order methods by scope first:**

1. `@staticmethod` methods
2. `@classmethod` methods
3. Instance methods

Within each group, place a method before the methods that call it. This mirrors the declaration order expected in compiled languages and lets readers understand dependencies without repeatedly jumping forward through the class.

**DO**
```python
class DeliveryPolicy:
    @staticmethod
    def _isExpired(expiresAt, now):
        return expiresAt <= now

    @classmethod
    def archiveExpired(cls, entries, now):
        return [entry for entry in entries if cls._isExpired(entry.expiresAt, now)]

    def refresh(self, now):
        return self.archiveExpired(self._entries, now)
```

**DON'T**
```python
class DeliveryPolicy:
    def refresh(self, now):
        return self.archiveExpired(self._entries, now)

    @classmethod
    def archiveExpired(cls, entries, now):
        return [entry for entry in entries if cls._isExpired(entry.expiresAt, now)]

    @staticmethod
    def _isExpired(expiresAt, now):
        return expiresAt <= now
```

---

## 18. Naming Convention for Keys — camelCase Everywhere Except JSON Files and URL Parameters

Use **camelCase** for all dict keys in Python code and for keys in JSON data exchanged at runtime (HTTP responses, messaging payloads, internal data). Use **snake_case** only in two specific contexts: JSON config files written to disk (user-editable files), and URL query parameters.

### Rule summary

| Context | Convention | Rationale |
|---|---|---|
| Python dict keys | camelCase | Consistent with variable/property names |
| JSON API responses (HTTP) | camelCase | Matches the Python code that produces them |
| JSON files on disk (config) | snake_case | User-editable; conventional for config files |
| `--json` CLI output file | snake_case | Documented protocol; lives on disk like config |
| URL query parameters | snake_case | Conventional for URLs; shared with browser/JS |
| External library kwargs | as-is | Must match the library's expected names |

**DO**: camelCase for dict keys in Python code and HTTP responses
```python
# Good: Python dict keys in code → camelCase
entry = {
    'fileName': name,
    'fileSize': size,
    'entryIndex': index,
    'needsZip64Descriptor': False,
}

# Good: HTTP JSON response body → camelCase
return {
    'chunkSize': CHUNK_SIZE,
    'fileSize': normalizedSize,
    'contentKey': encodedKey,
}
```

**DO**: snake_case for JSON config files on disk and URL parameters
```python
# Good: JSON config file written to disk → snake_case
config = {
    'preferred_tunnel': 'cloudflare',
    'fallback_order': ['cloudflare', 'ngrok', 'default'],
}

# Good: CLI --json output file (documented on-disk protocol) → snake_case
outputData = {
    'file': filePath,
    'file_size': fileSize,
    'upload_mode': 'server',
    'tunnel_type': 'cloudflare',
    'pickup_code': pickupCode,
}

# Good: URL query parameters → snake_case
params = {
    'stall_ms': stallMs,
    'probe_status': probeStatus,
    'range_ok': rangeOk,
}
requests.get(diagnosisUrl, params=params)
```

**DON'T**: mix conventions in the same context
```python
# Bad: snake_case in a runtime Python dict
entry = {
    'file_name': name,      # should be fileName
    'file_size': size,      # should be fileSize
    'entry_index': index,   # should be entryIndex
}

# Bad: camelCase in a JSON config file on disk
config = {
    'preferredTunnel': 'cloudflare',   # should be preferred_tunnel
    'fallbackOrder': [...],             # should be fallback_order
}

# Bad: camelCase in URL query parameters
params = {'stallMs': stallMs, 'probeStatus': probeStatus}
requests.get(url, params=params)
```

**Key distinction — "file on disk" vs "runtime data"**: The dividing line is whether the data is persisted to a file that a user might read or edit (`tunnels.json`, i18n config, `--json` CLI output). Runtime dicts and HTTP payloads that only exist in memory or travel over the wire follow camelCase just like Python variables.

---

## 19. Docstrings — Explain What's Needed, Not History

Docstrings exist to explain what a class/function *is* and *why* — only when
the why isn't obvious from the code itself. They are not a changelog: they
should not narrate how the code got here, what it used to be, or why an
earlier design was replaced. That belongs in a commit message or PR
description, not the source file, where it just rots as the code moves on.

**DO**: State the current design and any non-obvious invariant, once
```python
class RequestLogRoute:
    """Owns the browser's log-forwarding POST route (path/handler/write-back
    to the shared observer). Registered with name='logPath' so templates can
    look up its URL via `reverse` instead of a dedicated property."""

    LOG_PATH = '/webview/log'

    def handle(self, request):
        payload = request.readJSON()
        self._observer.onLog(payload)   # shared across every connection
        request.sendJSON({'ok': True})
```

**DON'T**: Narrate how the code arrived at its current shape
```python
class RequestLogRoute:
    """This used to be its own LoggingMixin, mixed into the request handler.
    It turned out routing didn't need to be optional, so factoring it into a
    separate mixin bought nothing, and it was inlined here instead, same as
    every other built-in route. Previously the URL was exposed via a
    dedicated logsURL property; that's now redundant since the route is
    registered with a name and reversed via the `reverse` template global."""
```

**DON'T**: Repeat the same explanation in every related class's docstring
```python
# Bad: the exact same "why this lives here, not per-connection" paragraph
# copy-pasted into ServerA and ServerB's docstrings
class ServerA:
    """... the Jinja Environment is a module-level cache keyed by directory,
    so building/using it once per server, not once per connection, is both
    correct and cheaper ..."""

class ServerB:
    """... the Jinja Environment is a module-level cache keyed by directory,
    so building/using it once per server, not once per connection, is both
    correct and cheaper ..."""
```
Say it once, in the class that owns the mechanism (e.g. the cache's own
docstring) — a consumer's docstring can reference it by name instead of
re-explaining it.

**DO**: Use a `#` comment, not a docstring, for a single non-obvious line
```python
def _mapRoute(self, method, path, handler, name=None):
    routeMap = self.paths[method]
    if path in routeMap:
        raise RuntimeError(f"Route conflict: {path} is already mapped for {method.name}")

    routeMap[path] = handler
    if name is not None:
        self.reversePaths[name] = getattr(path, 'pattern', path)  # falls back to the plain string for non-regex paths
```
A docstring documents the function's contract; a note about *why one specific
line* does what it does belongs next to that line, not hoisted into the
docstring where it bloats the summary a reader sees before they've even
looked at the body.

**Key Rules**:
- A docstring says what the code is/does and, only if non-obvious, why — never what it *used to* do or *used to be*.
- Don't duplicate the same explanation across sibling classes/files; document the mechanism once, where it's owned, and let consumers reference it.
- A hint tied to one specific line belongs in a `#` comment beside that line, not folded into the enclosing docstring.
- Verbose, repeated, or historical docstrings cost real context — for humans skimming the file and for AI tooling reading it — keep them lean.

---

## 20. Vertical Spacing — Separate Logical Units, Not Individual Lines

Use blank lines to make a reader see a function's logical phases: setup,
validation, the main operation, and cleanup or return. A blank line marks a real
change of thought. It is not decoration, and it must not be inserted after every
`if`, `try`, `for`, or `while` statement mechanically. Logical grouping is
semantic, not syntactic: a single loop may contain several independent validation
groups, each of which deserves its own spacing.

**DO**: group statements that jointly perform one operation, then leave one blank
line before the next independent operation.

```python
def connect(self, timeout):
    deadline = time.monotonic() + timeout

    while time.monotonic() < deadline:
        event = self._next_event(deadline)
        if event is None:
            continue
        if event.connected:
            return event.transport

    raise TimeoutError('connection timed out')
```

**DO**: separate distinct assertions or actions inside a control-flow block when
they validate different concerns.

```python
for stats in (server_stats, client_stats):
    self.assertEqual(2, stats['runtimeVersion'])
    self.assertGreater(stats['operationsProcessed'], 0)

    self.assertGreater(stats['receiveDatagrams'], 0)
    self.assertGreaterEqual(stats['maxReceiveBatch'], 1)

    self.assertGreater(stats['streamReceiveCallbacks'], 0)
    self.assertGreater(stats['streamReceiveBytes'], 0)
```

**DON'T**: split a single control-flow unit, or compress unrelated work into one
uninterrupted block.

```python
try:
    response = request()
    if response.ok:
        return response.data
except OSError:
    return None

cache.clear()
```

**Key Rules**:

- Keep an `if`/`elif`/`else` and a `try`/`except`/`finally` visually contiguous.
- Keep a loop's individual semantic groups together, but do not turn its whole
  body into one undifferentiated block.
- Add one blank line between independent stages, such as parsing arguments and
  opening a connection, or between runtime, transport, pooling, and stream
  assertions in the same loop.
- Do not use runs of blank lines; one blank line is sufficient.
- Prefer extracting a genuinely separate phase into a focused helper when spacing
  alone cannot make the flow clear.

---

## Summary
- **Write clean, linear code** with early returns and minimal nesting
- **Fail fast** on illegal states instead of masking problems with fallbacks
- **Unify logic** instead of duplicating similar functionality
- **Eliminate branches** through better code structure
- **Extract common code** into reusable functions
- **Make state transitions obvious** and easy to follow
- **Avoid string-based control flow** - use data presence and types instead
- **Use generic patterns** - leverage base class functionality like `captureOutputIn` instead of duplicating logic
- **No unnecessary defensive programming** - trust your initialization and use direct attribute access
- **Never silently suppress exceptions** - always log errors with appropriate logging levels, even if you don't handle them
- **Enums use integer values** — never `str` enum, never raw string/int comparisons; serialize only at JSON/API boundaries
- **Key naming**: camelCase for Python dict keys and HTTP JSON responses; snake_case for JSON config files on disk, CLI `--json` output, and URL query parameters
- **Docstrings explain what's needed, not history** - no changelog narration, no duplicated explanations across classes, and use `#` comments (not docstrings) for single-line hints

Following these principles results in code that is **easier to debug, maintain, and understand**.
