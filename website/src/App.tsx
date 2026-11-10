import {Layout, LayoutContent, VStack, HStack} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Kbd} from '@astryxdesign/core/Kbd';
import {Code} from '@astryxdesign/core/Code';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Divider} from '@astryxdesign/core/Divider';
import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {Demo} from './Demo';

const IS_MAC = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
/** The app opens with ⇧⌘C on macOS and Alt+Shift+C on Windows and Linux. */
const OPEN_KEYS = IS_MAC ? 'mod+shift+c' : 'alt+shift+c';

const SHORTCUTS: Array<{keys: string; suffix?: string; action: string}> = [
  {keys: OPEN_KEYS, action: 'Open the history from any app'},
  {keys: 'enter', action: 'Copy the selected item'},
  {keys: 'alt+enter', action: 'Copy it and paste it'},
  {keys: 'alt+shift+enter', action: 'Paste it without formatting'},
  {keys: 'mod+1', suffix: 'to 9', action: 'Pick one of the first nine'},
  {keys: 'alt+p', action: 'Pin or unpin an item'},
  {keys: 'alt+backspace', action: 'Delete the selected item'},
  {keys: 'mod+alt+backspace', action: 'Clear everything that is not pinned'},
];

const TICKER = [
  'git commit --amend --no-edit',
  '#E8683A',
  'Thanks, see you on Thursday at ten.',
  'https://tokly.blackielabs.com/',
  'Screenshot 16.20.png',
  'SELECT id, title FROM notes;',
  '+254 700 000 000',
  'npm run build && npm test',
  'Ngong Road, Nairobi',
  'border-radius: 12px;',
];

const FEATURES: Array<{title: string; body: string; variant: 'orange' | 'yellow' | 'pink' | 'purple' | 'teal' | 'green'; art: string}> = [
  {title: 'Text, images and files', body: 'Keeps the last 200 things you copied by default. Choose which kinds to save and how many to keep.', variant: 'orange', art: 'kinds'},
  {title: 'Four ways to search', body: 'Exact, fuzzy, regular expressions, or mixed, which tries each in turn. Matches light up as you type.', variant: 'yellow', art: 'search'},
  {title: 'Pins that stay put', body: 'Pin what you paste every day. Each pin gets a letter, and new copies never push it out.', variant: 'pink', art: 'pins'},
  {title: 'No repeats', body: 'Copy the same thing twice and Tokly lifts it back to the top instead of storing it again.', variant: 'purple', art: 'repeat'},
  {title: 'Screenshots, automatically', body: 'On a Mac, screenshots saved to your screenshot folder join the history without being copied first.', variant: 'teal', art: 'shot'},
  {title: 'Small, helpful details', body: 'Color swatches beside hex codes, visible line breaks and tabs, and paste as plain text when you want it.', variant: 'green', art: 'swatches'},
];

const PRIVACY = [
  {title: 'Stored on your computer', body: 'History is kept in a folder only your account can read. There is no account, no sync and no analytics.'},
  {title: 'Skips what password managers hide', body: 'On macOS and Windows, copies marked as concealed are never recorded. You can also ignore apps or any text matching a pattern.'},
  {title: 'Easy to pause and clear', body: 'Pause capturing or skip just the next copy from the menu bar icon. Clear the history any time, or automatically when you quit.'},
  {title: 'Two permissions, both optional', body: 'On a Mac, pasting for you needs the Accessibility permission, and adding screenshots makes macOS ask once for access to your screenshot folder. Both can stay off.'},
];

const FAQ = [
  {q: 'Can the demo on this page see my clipboard?', a: 'No. The demo is a small script with made-up items. It never reads your clipboard and forgets everything when you reload.'},
  {q: 'Why does Tokly ask for Accessibility access on a Mac?', a: 'Only so it can press ⌘V for you when you choose to paste an item directly. If you decline, Tokly still copies the item and you paste it yourself.'},
  {q: 'Does it remember my passwords?', a: 'Not when the app you copy from marks them as concealed, which is what password managers do on macOS and Windows. Linux has no such check yet. Anything copied as ordinary text is remembered, so pause capturing first.'},
  {q: 'Is it signed by Apple?', a: 'Not yet. Version 0.1.0 is an early build without a Developer ID signature or notarization, so macOS will warn you the first time it opens.'},
  {q: 'What about Windows and Linux?', a: 'Tokly builds for both, with Ctrl and Alt in place of ⌘ and ⌥ and Alt+Shift+C to open it. Those builds are still being tested and are not released yet. Screenshot pickup is Mac only.'},
];

function SectionHead({kicker, title, lede}: {kicker: string; title: string; lede?: string}) {
  return (
    <VStack gap={3} maxWidth={720}>
      <Text type="code" color="accent" weight="semibold">
        {kicker}
      </Text>
      <Heading level={2} type="display-3" textWrap="balance">
        {title}
      </Heading>
      {lede ? (
        <Text type="large" color="secondary" as="p">
          {lede}
        </Text>
      ) : null}
    </VStack>
  );
}

export function App() {
  return (
    <VStack gap={0} className="tokly">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <TopNav
        label="Main navigation"
        heading={<TopNavHeading logo={<img src="/assets/icon.svg" alt="" width={28} height={28} className="logo" />} heading="Tokly" headingHref="#top" />}
        endContent={
          <HStack gap={1} vAlign="center">
            <TopNavItem label="Shortcuts" href="#shortcuts" />
            <TopNavItem label="Privacy" href="#privacy" />
            <Button label="Install" href="#install" variant="primary" size="sm" />
          </HStack>
        }
      />

      <main id="main">
        <Layout
          height="auto"
          contentWidth={1180}
          content={
            <LayoutContent padding={6}>
              <VStack gap={10}>
                <section id="top" className="hero" aria-labelledby="hero-title">
                  <Grid columns={{minWidth: 340, repeat: 'fit'}} gap={10} align="start">
                    <VStack gap={6}>
                      <Text type="code" color="accent" weight="semibold">
                        CLIPBOARD HISTORY · LOCAL ONLY
                      </Text>
                      <Heading level={1} type="display-1" textWrap="balance" id="hero-title">
                        Everything you copied. <em className="ember">One shortcut</em> away.
                      </Heading>
                      <Text type="large" color="secondary" as="p">
                        Tokly sits in your menu bar and remembers what you copy. Press <Kbd keys={OPEN_KEYS} />, type a few letters, press return. That is the whole trick.
                      </Text>
                      <HStack gap={3} vAlign="center" wrap="wrap">
                        <Button label="Install Tokly" href="#install" variant="primary" size="lg" />
                        <Button label="See every shortcut" href="#shortcuts" variant="ghost" size="lg" />
                      </HStack>
                      <ul className="proof">
                        <li>
                          <strong>200</strong> copies remembered
                        </li>
                        <li>
                          <strong>4</strong> ways to search
                        </li>
                        <li>
                          <strong>0</strong> bytes leave your computer
                        </li>
                      </ul>
                    </VStack>
                    <Demo />
                  </Grid>
                </section>

                <section className="ticker" aria-label="Examples of things people copy">
                  <ul>
                    {[...TICKER, ...TICKER].map((item, index) => (
                      <li key={index} aria-hidden={index >= TICKER.length}>
                        <span>copied</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>

                <section id="shortcuts" aria-labelledby="shortcuts-title">
                  <VStack gap={6}>
                    <SectionHead kicker="KEYBOARD FIRST" title="Your hands never leave the keys." lede="Open the history from any app, pick what you need and get back to work. Keys are shown for the system you are on, and the opening shortcut can be changed." />
                    <span id="shortcuts-title" hidden>
                      Shortcuts
                    </span>
                    <ol className="keys">
                      {SHORTCUTS.map((shortcut) => (
                        <li key={shortcut.action}>
                          <span className="keys-combo">
                            <Kbd keys={shortcut.keys} />
                            {shortcut.suffix ? <Text type="supporting">{shortcut.suffix}</Text> : null}
                          </span>
                          <Text type="body">{shortcut.action}</Text>
                        </li>
                      ))}
                    </ol>
                  </VStack>
                </section>

                <section id="features" aria-label="Features">
                  <VStack gap={6}>
                    <SectionHead kicker="WHAT IT DOES" title="Small app. Long memory." />
                    <Grid columns={{minWidth: 300, repeat: 'fit'}} gap={4}>
                      {FEATURES.map((feature) => (
                        <Card key={feature.title} variant={feature.variant} padding={5}>
                          <VStack gap={4}>
                            <span className={`art art-${feature.art}`} aria-hidden="true" />
                            <VStack gap={1.5}>
                              <Heading level={3}>{feature.title}</Heading>
                              <Text type="body" color="secondary" as="p">
                                {feature.body}
                              </Text>
                            </VStack>
                          </VStack>
                        </Card>
                      ))}
                    </Grid>
                  </VStack>
                </section>

                <section id="privacy" aria-label="Privacy">
                  <VStack gap={6}>
                    <SectionHead kicker="PRIVACY" title="Your clipboard stays on your computer." lede="A clipboard manager sees a lot, so here is exactly what Tokly does with it." />
                    <Grid columns={{minWidth: 240, repeat: 'fit'}} gap={6}>
                      {PRIVACY.map((fact, index) => (
                        <VStack key={fact.title} gap={2}>
                          <Text type="code" color="accent">
                            {String(index + 1).padStart(2, '0')}
                          </Text>
                          <Heading level={3}>{fact.title}</Heading>
                          <Text type="body" color="secondary" as="p">
                            {fact.body}
                          </Text>
                        </VStack>
                      ))}
                    </Grid>
                    <Card variant="muted" padding={4} maxWidth={760}>
                      <Text type="body" as="p">
                        Ordinary text you copy is stored as copied. Pause capturing before copying something sensitive from an app that does not mark it as concealed.
                      </Text>
                    </Card>
                  </VStack>
                </section>

                <section id="install" aria-label="Install" data-release="pending">
                  <VStack gap={6}>
                    <SectionHead kicker="INSTALL" title="One line in Terminal." lede="Tokly for macOS is distributed through Homebrew. Windows and Linux builds exist and are being tested." />
                    <Grid columns={{minWidth: 300, repeat: 'fit'}} gap={4}>
                      <Card padding={5} elevation="med">
                        <VStack gap={3}>
                          <HStack gap={2} vAlign="center">
                            <Heading level={3}>macOS</Heading>
                            <span className="pill pill-pending">Homebrew cask not published yet</span>
                          </HStack>
                          <CodeBlock code="brew install --cask blackie360/tokly/tokly" language="bash" hasLanguageLabel={false} width="100%" size="sm" />
                          <Text type="supporting" as="p">
                            This is the planned command. It will start working when the first release is published. Version 0.1.0 needs macOS 12 or later. Not yet signed or notarized by Apple.
                          </Text>
                        </VStack>
                      </Card>
                      <Card padding={5}>
                        <VStack gap={3}>
                          <HStack gap={2} vAlign="center">
                            <Heading level={3}>Windows</Heading>
                            <span className="pill">In testing, not released yet</span>
                          </HStack>
                          <Text type="body" color="secondary" as="p">
                            An installer for 64-bit Windows 10 and later. Opens with <Code>Alt+Shift+C</Code> and lives in the system tray. The installer is not code-signed.
                          </Text>
                        </VStack>
                      </Card>
                      <Card padding={5}>
                        <VStack gap={3}>
                          <HStack gap={2} vAlign="center">
                            <Heading level={3}>Linux</Heading>
                            <span className="pill">In testing, not released yet</span>
                          </HStack>
                          <Text type="body" color="secondary" as="p">
                            A <Code>.deb</Code> package for 64-bit systems with a system tray. No concealed-copy detection or per-app ignore list yet.
                          </Text>
                        </VStack>
                      </Card>
                    </Grid>
                  </VStack>
                </section>

                <section aria-label="Questions">
                  <VStack gap={6}>
                    <SectionHead kicker="QUESTIONS" title="Good to know." />
                    <VStack maxWidth={760}>
                      <CollapsibleGroup type="single" hasDividers>
                        {FAQ.map((entry) => (
                          <Collapsible key={entry.q} value={entry.q} trigger={<Text type="body" weight="semibold">{entry.q}</Text>}>
                            <Text type="body" color="secondary" as="p">
                              {entry.a}
                            </Text>
                          </Collapsible>
                        ))}
                      </CollapsibleGroup>
                    </VStack>
                  </VStack>
                </section>

                <VStack gap={4}>
                  <Divider />
                  <HStack gap={4} vAlign="center" hAlign="between" wrap="wrap">
                    <HStack gap={2} vAlign="center">
                      <img src="/assets/icon.svg" alt="" width={24} height={24} className="logo" />
                      <Text type="body" weight="semibold">
                        Tokly
                      </Text>
                    </HStack>
                    <Text type="supporting">Clipboard history for your menu bar.</Text>
                    <Text type="supporting">© 2026 Blackie Labs</Text>
                  </HStack>
                </VStack>
              </VStack>
            </LayoutContent>
          }
        />
      </main>
    </VStack>
  );
}
