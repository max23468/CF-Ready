from pathlib import Path
import re

ROOT = Path('.')


def line_slice(lines, start, end):
    return ''.join(lines[start - 1:end])


def export_declarations(text):
    text = re.sub(r'(?m)^const ', 'export const ', text)
    text = re.sub(r'(?m)^function ', 'export function ', text)
    text = re.sub(r'(?m)^async function ', 'export async function ', text)
    return text


def split_i18n():
    path = ROOT / 'app/i18n.ts'
    src = path.read_text()
    it_start = src.index('const it = {')
    en_marker = '\n\nconst en: typeof it = {'
    en_start = src.index(en_marker)
    dict_marker = '\n\nconst dictionaries = { it, en };'
    dict_start = src.index(dict_marker)

    it_block = src[it_start:en_start].replace('const it = {', 'export const it = {', 1).strip() + '\n'
    en_block = src[en_start + 2:dict_start].replace(
        'const en: typeof it = {', 'export const en: typeof it = {', 1
    ).strip() + '\n'

    directory = ROOT / 'app/i18n'
    directory.mkdir(exist_ok=True)
    (directory / 'it.ts').write_text(it_block)
    (directory / 'en.ts').write_text('import type { it } from "./it";\n\n' + en_block)
    (directory / 'types.ts').write_text('export type Locale = "it" | "en";\n')
    (directory / 'format.ts').write_text('''import { CURRENCY } from "../config";\nimport type { Locale } from "./types";\n\nconst moneyFormatters = new Map<Locale, Intl.NumberFormat>();\nconst dateFormatters = new Map<Locale, Intl.DateTimeFormat>();\n\nexport function formatMoney(amount: number, locale: Locale) {\n  let formatter = moneyFormatters.get(locale);\n  if (!formatter) {\n    formatter = new Intl.NumberFormat(locale, { style: "currency", currency: CURRENCY });\n    moneyFormatters.set(locale, formatter);\n  }\n  return formatter.format(amount);\n}\n\n// La data arriva come giorno locale dello store, senza orario: si formatta in UTC per non\n// spostarla di un giorno nel fuso di chi legge.\nexport function formatDate(iso: string | null, locale: Locale) {\n  if (!iso) return "";\n  let formatter = dateFormatters.get(locale);\n  if (!formatter) {\n    formatter = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" });\n    dateFormatters.set(locale, formatter);\n  }\n  return formatter.format(new Date(`${iso}T00:00:00Z`));\n}\n''')

    helpers_start = src.index('export function texts(locale: Locale)')
    helpers = src[helpers_start:]
    header = '''import type { ErrorDisplay, Rules } from "./config";\nimport { en } from "./i18n/en";\nimport { formatDate, formatMoney } from "./i18n/format";\nimport { it } from "./i18n/it";\nimport type { Locale } from "./i18n/types";\n\nexport type { Locale } from "./i18n/types";\nexport { formatDate, formatMoney };\n\n// §22: unica casella di assistenza, la stessa dichiarata nel sito pubblico e in `SECURITY.md`.\nexport const SUPPORT_EMAIL = "cfready@icloud.com";\n\n// §16.1: la lingua è quella dell'amministratore Shopify corrente, non quella dello store e non\n// una preferenza salvata. Il caricamento iniziale porta `locale` nell'URL; sulle richieste\n// successive App Bridge imposta `Accept-Language` verso il dominio dell'app. Tutto ciò che non\n// è `it*` è inglese.\nexport function resolveLocale(request: Request): Locale {\n  const tag =\n    new URL(request.url).searchParams.get("locale") ?? request.headers.get("accept-language") ?? "";\n  return tag.trim().toLowerCase().startsWith("it") ? "it" : "en";\n}\n\nconst dictionaries = { it, en };\n\n'''
    path.write_text(header + helpers)


def split_lifecycle_tests():
    src_path = ROOT / 'tests/lifecycle.test.ts'
    lines = src_path.read_text().splitlines(keepends=True)
    if len(re.findall(r'(?m)^test\(', ''.join(lines))) != 48:
        raise RuntimeError('Unexpected lifecycle test count')
    sl = lambda a, b: line_slice(lines, a, b)

    support = export_declarations(sl(30, 40) + '\n' + sl(69, 80) + '\n' + sl(104, 235))
    support_path = ROOT / 'tests/support/lifecycle.ts'
    support_path.parent.mkdir(parents=True, exist_ok=True)
    support_path.write_text(
        'import { env } from "cloudflare:test";\n'
        'import type { WebhookJob } from "../../app/webhooks.server";\n\n' + support
    )

    imports = {
        'env': ('cloudflare:test', 'value'),
        'expect': ('vitest', 'value'),
        'test': ('vitest', 'value'),
        'vi': ('vitest', 'value'),
        'logEvent': ('app/events.server', 'value'),
        'recordEvent': ('app/events.server', 'value'),
        'applyRetention': ('app/shop.server', 'value'),
        'markUninstalled': ('app/shop.server', 'value'),
        'recordInstallOnce': ('app/shop.server', 'value'),
        'redactExpiredShops': ('app/shop.server', 'value'),
        'redactShop': ('app/shop.server', 'value'),
        'refuseInstall': ('app/shop.server', 'value'),
        'localDate': ('app/billing.server', 'value'),
        'startTrial': ('app/billing.server', 'value'),
        'trialEnd': ('app/billing.server', 'value'),
        'acquireValidationLock': ('app/validation.server', 'value'),
        'readOnboarding': ('app/validation.server', 'value'),
        'reconcile': ('app/validation.server', 'value'),
        'releaseValidationLockBestEffort': ('app/validation.server', 'value'),
        'saveOnboarding': ('app/validation.server', 'value'),
        'claimWebhook': ('app/webhooks.server', 'value'),
        'consumeWebhookMessage': ('app/webhooks.server', 'value'),
        'finishWebhook': ('app/webhooks.server', 'value'),
        'handleWebhook': ('app/webhooks.server', 'value'),
        'renewWebhookClaim': ('app/webhooks.server', 'value'),
        'runClaimedWebhook': ('app/webhooks.server', 'value'),
        'WebhookJob': ('app/webhooks.server', 'type'),
    }
    support_names = [
        'CONFIG', 'webhookQueue', 'insertShop', 'FUSO', 'SENZA_DIRITTO', 'shopContext',
        'SENZA_ADDEBITI', 'CONVERSIONE_UNA_TANTUM', 'adminStub', 'appState', 'clearBillingEvents'
    ]

    def make_imports(text, depth=2):
        by_source = {}
        for name, (source, kind) in imports.items():
            if re.search(rf'\b{re.escape(name)}\b', text):
                by_source.setdefault((source, kind), []).append(name)
        out = []
        source_order = [
            'cloudflare:test', 'vitest', 'app/events.server', 'app/shop.server',
            'app/billing.server', 'app/validation.server', 'app/webhooks.server'
        ]
        for source in source_order:
            for kind in ('value', 'type'):
                names = by_source.get((source, kind))
                if not names:
                    continue
                target = source if not source.startswith('app/') else '../' * depth + source
                prefix = 'import type' if kind == 'type' else 'import'
                out.append(f'{prefix} {{ {", ".join(names)} }} from "{target}";')
        used_support = [name for name in support_names if re.search(rf'\b{re.escape(name)}\b', text)]
        if used_support:
            out.append(f'import {{ {", ".join(used_support)} }} from "../support/lifecycle";')
        return '\n'.join(out) + '\n\n'

    logging = sl(41, 68) + '\n' + sl(81, 103)
    clusters = [
        ('tests/lifecycle/logging.test.ts', logging),
        ('tests/validation/reconcile-country.test.ts', sl(236, 547)),
        ('tests/validation/reconcile-billing.test.ts', sl(548, 759)),
        ('tests/validation/duplicate-validations.test.ts', sl(760, 826)),
        ('tests/webhooks/lifecycle.test.ts', sl(827, 1213)),
        ('tests/shop/lifecycle.test.ts', sl(1214, 1573)),
        ('tests/onboarding/lifecycle.test.ts', sl(1574, len(lines))),
    ]
    total = 0
    for name, text in clusters:
        total += len(re.findall(r'(?m)^test\(', text))
        path = ROOT / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(make_imports(text) + text)
    if total != 48:
        raise RuntimeError(f'Lifecycle split lost tests: {total}')
    src_path.unlink()


def split_billing_tests():
    src_path = ROOT / 'tests/billing.test.ts'
    lines = src_path.read_text().splitlines(keepends=True)
    if len(re.findall(r'(?m)^test\(', ''.join(lines))) != 32:
        raise RuntimeError('Unexpected billing test count')
    sl = lambda a, b: line_slice(lines, a, b)

    support = export_declarations(sl(30, 41) + '\n' + sl(202, 229))
    support_path = ROOT / 'tests/support/billing.ts'
    support_path.parent.mkdir(parents=True, exist_ok=True)
    support_path.write_text('import { env } from "cloudflare:test";\n\n' + support)

    billing_names = [
        'addDays', 'cancelSubscription', 'createCharge', 'currentPricingGeneration',
        'entitlementFor', 'localDate', 'markTrialConverted', 'pricingGeneration',
        'proratedCredit', 'readBilling', 'requestedRecurringPlanIsActive',
        'remainingTrialDays', 'returnUrlFor', 'syncBillingAccount', 'startTrial',
        'syncTrial', 'trialEnd'
    ]
    validation_names = ['configWithEntitlement', 'entitlementDiffers', 'withValidationLock']
    support_names = ['insertShop', 'NESSUN_ADDEBITO', 'opzioni', 'abbonamento']

    def make_imports(text, depth=2):
        out = []
        if re.search(r'\benv\b', text):
            out.append('import { env } from "cloudflare:test";')
        vit = [name for name in ['expect', 'test', 'vi'] if re.search(rf'\b{name}\b', text)]
        if vit:
            out.append(f'import {{ {", ".join(vit)} }} from "vitest";')
        names = [name for name in billing_names if re.search(rf'\b{name}\b', text)]
        if names:
            out.append(f'import {{ {", ".join(names)} }} from "{"../" * depth}app/billing.server";')
        if re.search(r'\btrialLedgerHash\b', text):
            out.append(f'import {{ trialLedgerHash }} from "{"../" * depth}app/hash.server";')
        if re.search(r'\bredactShop\b', text):
            out.append(f'import {{ redactShop }} from "{"../" * depth}app/shop.server";')
        names = [name for name in validation_names if re.search(rf'\b{name}\b', text)]
        if names:
            out.append(f'import {{ {", ".join(names)} }} from "{"../" * depth}app/validation.server";')
        names = [name for name in support_names if re.search(rf'\b{name}\b', text)]
        if names:
            out.append(f'import {{ {", ".join(names)} }} from "../support/billing";')
        return '\n'.join(out) + '\n\n'

    clusters = [
        ('tests/billing/trial.test.ts', sl(42, 201)),
        ('tests/billing/account-reconciliation.test.ts', sl(230, 395)),
        ('tests/billing/shopify-read.test.ts', sl(396, 567)),
        ('tests/billing/charges.test.ts', sl(568, 691)),
        ('tests/billing/boundaries.test.ts', sl(692, 746)),
        ('tests/billing/cancellation.test.ts', sl(747, 789)),
        ('tests/billing/entitlement.test.ts', sl(790, len(lines))),
    ]
    total = 0
    for name, text in clusters:
        total += len(re.findall(r'(?m)^test\(', text))
        path = ROOT / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(make_imports(text) + text)
    if total != 32:
        raise RuntimeError(f'Billing split lost tests: {total}')
    src_path.unlink()


def split_i18n_tests():
    src_path = ROOT / 'tests/i18n.test.ts'
    lines = src_path.read_text().splitlines(keepends=True)
    if len(re.findall(r'(?m)^test\(', ''.join(lines))) != 20:
        raise RuntimeError('Unexpected i18n test count')
    sl = lambda a, b: line_slice(lines, a, b)
    config_names = [
        'address2Declaration', 'DEFAULT_CONFIG', 'MESSAGE_KEYS', 'messagesAreDefault',
        'messageAppears', 'parseOnboardingStep', 'pendingFetcherIntent', 'pendingFetcherSource',
        'reviewIsDue', 'showSavedBanner', 'validateMessages'
    ]
    i18n_names = [
        'describeCheckout', 'formatDate', 'formatMoney', 'homeCheckoutSummary', 'resolveLocale',
        'summariseCheckout', 'SUPPORT_EMAIL', 'supportMailto', 'texts', 'trialNotice',
        'validationStatus'
    ]

    def make_imports(text):
        out = ['import { expect, test } from "vitest";']
        names = [name for name in config_names if re.search(rf'\b{re.escape(name)}\b', text)]
        if names:
            out.append(f'import {{ {", ".join(names)} }} from "../../app/config";')
        names = [name for name in i18n_names if re.search(rf'\b{re.escape(name)}\b', text)]
        if names:
            out.append(f'import {{ {", ".join(names)} }} from "../../app/i18n";')
        if re.search(r'\burl\b', text):
            out.append('\nconst url = "https://cf-ready-dev.tmsf.workers.dev/app";')
        return '\n'.join(out) + '\n\n'

    clusters = [
        ('tests/i18n/locale-and-state.test.ts', sl(31, 82)),
        ('tests/i18n/checkout-copy.test.ts', sl(83, 212)),
        ('tests/i18n/format-and-messages.test.ts', sl(213, 266)),
        ('tests/i18n/notices-review-support.test.ts', sl(267, len(lines))),
    ]
    total = 0
    for name, text in clusters:
        total += len(re.findall(r'(?m)^test\(', text))
        path = ROOT / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(make_imports(text) + text)
    if total != 20:
        raise RuntimeError(f'i18n split lost tests: {total}')
    src_path.unlink()


split_i18n()
split_lifecycle_tests()
split_billing_tests()
split_i18n_tests()
print('Structural split generated successfully')
