import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Kbd} from '@astryxdesign/core/Kbd';
import {Code} from '@astryxdesign/core/Code';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {Link} from '@astryxdesign/core/Link';
import {useState} from 'react';
import {TopNav, TopNavHeading} from '@astryxdesign/core/TopNav';
import {Demo} from './Demo';

const AGENT = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const IS_MAC = AGENT.includes('Mac');
type System = 'macos' | 'windows' | 'linux';
const VISITOR_SYSTEM: System = AGENT.includes('Windows') ? 'windows' : AGENT.includes('Linux') && !AGENT.includes('Android') ? 'linux' : 'macos';
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

const FEATURES = [
  {title: 'Text, images and files', body: 'The last 200 copies by default. You choose the kinds and the count.'},
  {title: 'Four ways to search', body: 'Exact, fuzzy, regular expressions, or mixed.'},
  {title: 'Pins that stay put', body: 'Each pin gets a letter, and new copies never push it out.'},
  {title: 'No repeats', body: 'Copy something twice and it lifts back to the top.'},
  {title: 'Screenshots, automatically', body: 'On a Mac, saved screenshots join the history on their own.'},
  {title: 'Plain text when you want it', body: 'Paste without the fonts and colors that came along.'},
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
  {q: 'What about Windows and Linux?', a: 'Both have early builds with an install command on this page. They use Ctrl and Alt in place of ⌘ and ⌥, and Alt+Shift+C opens the history. Screenshot pickup is Mac only, and Linux cannot yet skip password-manager copies.'},
];

const INSTALL: Record<System, {label: string; status: string; isPending?: boolean; command: string; notes: string}> = {
  macos: {
    label: 'macOS',
    status: 'Homebrew cask not published yet',
    isPending: true,
    command: 'brew install --cask blackie360/tokly/tokly',
    notes: 'This is the planned command; it will work once the cask is published. Until then the app is a zip on the releases page. Version 0.1.0 needs macOS 12 or later. Not yet signed or notarized by Apple, so macOS will ask you to allow it.',
  },
  windows: {
    label: 'Windows',
    status: 'Early build',
    command: 'irm https://tokly.blackielabs.com/install.ps1 | iex',
    notes: 'Run it in PowerShell on 64-bit Windows 10 or later. It downloads the setup program, checks its SHA-256 and installs for your account only. Early build: installed and started in automated tests, not yet on many real PCs. The setup program is not code-signed.',
  },
  linux: {
    label: 'Linux',
    status: 'Early build',
    command: 'curl -fsSL https://tokly.blackielabs.com/install.sh | sh',
    notes: 'For 64-bit Debian, Ubuntu and relatives with a system tray. It downloads the .deb, checks its SHA-256 and installs it with apt. Early build: installed and started in automated tests, not yet on many real desktops.',
  },
};

const TABS = [
  {value: 'shortcuts', label: 'Shortcuts'},
  {value: 'features', label: 'What it does'},
  {value: 'privacy', label: 'Privacy'},
  {value: 'questions', label: 'Questions'},
];

function Shortcuts() {
  return (
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
  );
}

function Features() {
  return (
    <ul className="lines">
      {FEATURES.map((feature) => (
        <li key={feature.title}>
          <Text type="body" weight="semibold">
            {feature.title}
          </Text>
          <Text type="supporting">{feature.body}</Text>
        </li>
      ))}
    </ul>
  );
}

function Privacy() {
  return (
    <VStack gap={4}>
      <ul className="lines">
        {PRIVACY.map((fact) => (
          <li key={fact.title}>
            <Text type="body" weight="semibold">
              {fact.title}
            </Text>
            <Text type="supporting">{fact.body}</Text>
          </li>
        ))}
      </ul>
      <Text type="supporting" color="primary" as="p">
        Ordinary text you copy is stored as copied. Pause capturing before copying something sensitive from an app that does not mark it as concealed.
      </Text>
    </VStack>
  );
}

function Questions() {
  return (
    <CollapsibleGroup type="single" hasDividers density="compact">
      {FAQ.map((entry) => (
        <Collapsible key={entry.q} value={entry.q} trigger={<Text type="body" weight="semibold">{entry.q}</Text>}>
          <Text type="supporting" as="p">
            {entry.a}
          </Text>
        </Collapsible>
      ))}
    </CollapsibleGroup>
  );
}

function Install() {
  const [system, setSystem] = useState<System>(VISITOR_SYSTEM);
  const choice = INSTALL[system];
  return (
    <Card padding={5}>
      <VStack gap={4}>
        <Heading level={2}>Install</Heading>
        <SegmentedControl label="Choose your system" value={system} onChange={(value) => setSystem(value as System)} layout="fill">
          <SegmentedControlItem value="macos" label="macOS" />
          <SegmentedControlItem value="windows" label="Windows" />
          <SegmentedControlItem value="linux" label="Linux" />
        </SegmentedControl>
        <VStack gap={3} data-release="pending">
          <span className={choice.isPending ? 'pill pill-pending' : 'pill'}>{choice.status}</span>
          <CodeBlock code={choice.command} language="bash" hasLanguageLabel={false} width="100%" size="sm" />
          <Text type="supporting" as="p">
            {choice.notes}
          </Text>
          <Link href="https://github.com/Blackie360/Tokly/releases" target="_blank">
            All downloads and checksums on GitHub
          </Link>
        </VStack>
      </VStack>
    </Card>
  );
}

export function App() {
  const [tab, setTab] = useState('shortcuts');
  return (
    <VStack gap={0} className="tokly">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <main id="main">
        <section id="top" className="screen" aria-labelledby="hero-title">
          <TopNav
            label="Main navigation"
            heading={<TopNavHeading logo={<img src="/assets/icon.svg" alt="" width={28} height={28} className="logo" />} heading="Tokly" headingHref="#top" />}
            endContent={
              <Button label="Install" href="#more" variant="secondary" size="sm" />
            }
          />
          <VStack className="screen-body" vAlign="center">
            <Grid columns={{minWidth: 340, repeat: 'fit'}} gap={10} align="center">
              <VStack gap={5}>
                <Heading level={1} type="display-1" textWrap="balance" id="hero-title">
                  Everything you copied. <em className="ember">One shortcut</em> away.
                </Heading>
                <Text type="large" color="secondary" as="p">
                A clipboard history that stays on your computer. Press <Kbd keys={OPEN_KEYS} />, type a few letters, press return.
                </Text>
                <HStack gap={3} vAlign="center">
                  <Button label="Install Tokly" href="#more" variant="primary" size="lg" />
                </HStack>
              </VStack>
              <Demo />
            </Grid>
          </VStack>
        </section>

        <section id="more" className="screen" aria-label="Details and install">
          <VStack className="screen-body" vAlign="center" gap={6}>
            <Grid columns={{minWidth: 340, repeat: 'fit'}} gap={8} align="start">
              <VStack gap={4} className="explore">
                <Heading level={2} type="display-3" textWrap="balance">
                  Your hands never leave the keys.
                </Heading>
                <TabList value={tab} onChange={setTab} role="tablist" hasDivider>
                  {TABS.map((entry) => (
                    <Tab key={entry.value} value={entry.value} label={entry.label} panelId="explore-panel" />
                  ))}
                </TabList>
                <VStack id="explore-panel" role="tabpanel" aria-label={TABS.find((entry) => entry.value === tab)?.label} className="explore-panel">
                  {tab === 'shortcuts' ? <Shortcuts /> : null}
                  {tab === 'features' ? <Features /> : null}
                  {tab === 'privacy' ? <Privacy /> : null}
                  {tab === 'questions' ? <Questions /> : null}
                </VStack>
              </VStack>
              <Install />
            </Grid>
          </VStack>
          <footer className="foot">
            <HStack gap={2} vAlign="center">
              <img src="/assets/icon.svg" alt="" width={22} height={22} className="logo" />
              <Text type="body" weight="semibold">
                Tokly
              </Text>
            </HStack>
            <Text type="supporting">Clipboard history for your menu bar.</Text>
            <Text type="supporting">© 2026 Blackie Labs</Text>
          </footer>
        </section>
      </main>
    </VStack>
  );
}
