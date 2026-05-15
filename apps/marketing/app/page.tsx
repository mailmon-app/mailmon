import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#1c1917] selection:bg-[#8161FF] selection:text-white font-sans">
      <div className="max-w-5xl mx-auto px-6">
        <header className="py-7 flex items-center justify-between">
          <Link className="flex items-center gap-2.5" href="/">
            <svg
              width="22"
              height="22"
              viewBox="0 0 134 134"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                opacity="0.5"
                d="M0 90.9294L43.0709 134L55.4167 68.1611C55.7302 66.489 55.1984 64.7698 53.9954 63.5669L19.7548 29.3272C16.8242 26.3967 11.8088 27.9483 11.045 32.0218L0 90.9294Z"
                fill="#8161FF"
              ></path>
              <path
                d="M43.072 134L0.00113678 90.9288L65.8393 78.5842C67.5114 78.2706 69.2305 78.8025 70.4334 80.0054L104.674 114.245C107.605 117.175 106.053 122.191 101.979 122.955L43.072 134Z"
                fill="#8161FF"
              ></path>
              <path
                opacity="0.5"
                d="M90.9291 0L134.001 43.0721L68.1618 55.4168C66.4897 55.7303 64.7707 55.1984 63.5677 53.9955L29.3281 19.7559C26.3975 16.8253 27.949 11.8098 32.0225 11.046L90.9291 0Z"
                fill="#8161FF"
              ></path>
              <path
                d="M78.5864 65.8407C78.2729 67.5128 78.8047 69.2319 80.0077 70.4348L114.247 104.674C117.178 107.605 122.193 106.053 122.957 101.98L134.002 43.0723L90.9311 0.00140381L78.5864 65.8407Z"
                fill="#8161FF"
              ></path>
            </svg>
            <span className="font-semibold text-[20px] tracking-tight">mailmon</span>
          </Link>

          <nav className="flex items-center gap-5 text-sm">
            <Link className="text-[#3f3f46] hover:text-[#1c1917] transition-colors" href="/docs">
              docs
            </Link>
            <a
              href="https://github.com/mailmon/mailmon"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#3f3f46] hover:text-[#1c1917] transition-colors"
            >
              github
            </a>
            <Link
              className="bg-[#8161FF] hover:bg-[#6b4fd9] text-white px-4 py-2 rounded-lg transition-colors font-medium"
              href="/docs"
            >
              Start
            </Link>
          </nav>
        </header>

        <section className="grid gap-10 lg:grid-cols-[1fr_0.95fr] items-center pt-16 pb-14">
          <div>
            <p className="text-xs text-[#78716c] uppercase tracking-wider font-semibold mb-5">
              Correctness layer over Gmail
            </p>
            <h1 className="text-[48px] leading-[1.02] tracking-tight max-w-2xl font-bold">
              Reliable Gmail state without building sync infrastructure.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#52525b]">
              Connect Gmail mailboxes, maintain canonical message and thread state, and deliver
              replayable webhook events when mailbox data changes.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                className="inline-flex items-center rounded-md bg-[#8161FF] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#6b4fd9]"
                href="/docs"
              >
                Read the docs
              </Link>
              <a
                href="https://github.com/mailmon/mailmon"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-[#e5e5e5] bg-white px-4 py-2.5 text-sm font-medium text-[#3f3f46] shadow-sm transition-colors hover:bg-[#f5f5f5] hover:text-[#1c1917]"
              >
                View GitHub
              </a>
            </div>

            <div className="mt-10 grid gap-3 text-sm text-[#52525b] sm:grid-cols-3">
              <p>
                <span className="block font-semibold text-[#1c1917]">State first</span>
                Cursor advances after state and events commit.
              </p>
              <p>
                <span className="block font-semibold text-[#1c1917]">At least once</span>
                Stable event IDs make webhook dedupe explicit.
              </p>
              <p>
                <span className="block font-semibold text-[#1c1917]">Replayable</span>
                Re-run historical mailbox events through handlers.
              </p>
            </div>
          </div>

          <div className="bg-[#18181b] rounded-xl overflow-hidden shadow-lg border border-[#27272a]">
            <div className="flex items-center px-4 py-3 border-b border-[#27272a] bg-[#1f1f22]">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
                <div className="w-3 h-3 rounded-full bg-[#eab308]"></div>
                <div className="w-3 h-3 rounded-full bg-[#22c55e]"></div>
              </div>
              <div className="ml-4 flex gap-4 text-xs font-mono text-[#a1a1aa]">
                <span className="text-white bg-[#27272a] px-2 py-1 rounded">connect.ts</span>
                <span className="hover:text-white cursor-pointer px-2 py-1">webhooks.ts</span>
              </div>
            </div>
            <div className="p-6 overflow-x-auto">
              <pre className="font-mono text-xs sm:text-sm text-[#e4e4e7] leading-relaxed">
                <code>
                  <span className="text-[#a1a1aa]">// Connect a Gmail mailbox</span>
                  {"\n"}
                  <span className="text-[#cba6f7]">import</span> {"{\n  MailmonClient,\n}"}{" "}
                  <span className="text-[#cba6f7]">from</span>{" "}
                  <span className="text-[#a6e3a1]">"@mailmon.dev/sdk"</span>
                  {"\n\n"}
                  <span className="text-[#cba6f7]">const</span> client ={" "}
                  <span className="text-[#cba6f7]">new</span> MailmonClient{"({\n"}
                  <span className="text-[#89b4fa]">token</span>: process.env.MAILMON_API_KEY,{"\n"}
                  {"})\n\n"}
                  <span className="text-[#cba6f7]">const</span> session ={"\n  "}
                  <span className="text-[#cba6f7]">await</span> client{"\n    ."}
                  postV1MailboxesConnectSessions{"({\n"}
                  <span className="text-[#89b4fa]">provider</span>:{" "}
                  <span className="text-[#a6e3a1]">"gmail"</span>,{"\n"}
                  <span className="text-[#89b4fa]">tenantExternalId</span>:{" "}
                  <span className="text-[#a6e3a1]">"user_123"</span>,{"\n"}
                  <span className="text-[#89b4fa]">mailboxExternalId</span>:{" "}
                  <span className="text-[#a6e3a1]">"primary"</span>,{"\n"}
                  <span className="text-[#89b4fa]">redirectUrl</span>:{" "}
                  <span className="text-[#a6e3a1]">"https://app.test/cb"</span>,{"\n"}
                  {"})"}
                </code>
              </pre>
            </div>
          </div>
        </section>

        <section className="py-12 border-t border-[#e7e5e4]">
          <p className="text-xs text-[#78716c] uppercase tracking-wider font-semibold mb-6">
            Why not call Gmail directly?
          </p>
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <p className="font-semibold text-[#18181b]">Push is not truth</p>
              <p className="mt-2 text-sm leading-6 text-[#52525b]">
                Gmail push notifications wake up work. Mailmon uses Gmail history as the source of
                truth.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#18181b]">Retries get messy</p>
              <p className="mt-2 text-sm leading-6 text-[#52525b]">
                Duplicate pushes, worker crashes, and failed webhooks become explicit state instead
                of hidden edge cases.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#18181b]">Handlers change</p>
              <p className="mt-2 text-sm leading-6 text-[#52525b]">
                Replay stored mailbox events into local or production endpoints when your processing
                logic evolves.
              </p>
            </div>
          </div>
        </section>

        <section className="py-12 border-t border-[#e7e5e4]">
          <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">What Mailmon does</h2>
            </div>
            <div className="space-y-5 text-[#3f3f46] leading-relaxed">
              <p>
                Users connect Gmail through OAuth. Mailmon syncs their mailbox into canonical
                messages and threads, exposes that state through an API, and emits durable mailbox
                events when data changes.
              </p>
              <p>
                The system is built around mailbox leases, durable cursors, and event records so one
                mailbox has one active sync path and every downstream webhook has an event ID to
                deduplicate.
              </p>
            </div>
          </div>

          <div className="mt-10">
            <div className="grid gap-3 font-mono text-sm bg-white border border-[#e7e5e4] p-5 rounded-xl">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4">
                <span className="text-[#52525b]">Gmail push</span>
                <span className="text-[#a8a29e]">→</span>
                <span className="text-[#1c1917] font-medium">mailbox sync</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4">
                <span className="text-[#52525b]">message.created</span>
                <span className="text-[#a8a29e]">→</span>
                <span className="text-[#1c1917] font-medium">durable event log</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4">
                <span className="text-[#52525b]">webhook delivery</span>
                <span className="text-[#a8a29e]">→</span>
                <span className="text-[#1c1917] font-medium">your endpoint</span>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 border-t border-[#e7e5e4]">
          <h2 className="text-2xl font-bold tracking-tight mb-8">Details</h2>
          <div className="space-y-8">
            <div>
              <p className="text-[#1c1917] font-medium text-lg">Is Mailmon an email sending API?</p>
              <p className="text-[#52525b] mt-2">
                No. Mailmon is focused on Gmail mailbox sync, normalized read models, durable
                events, and webhooks.
              </p>
            </div>
            <div>
              <p className="text-[#1c1917] font-medium text-lg">
                What delivery guarantee do webhooks have?
              </p>
              <p className="text-[#52525b] mt-2">
                Webhook delivery is at least once. Your handler should deduplicate with the stable
                event ID included on every event.
              </p>
            </div>
            <div>
              <p className="text-[#1c1917] font-medium text-lg">Can I test webhooks locally?</p>
              <p className="text-[#52525b] mt-2">
                Yes. The Mailmon CLI can forward webhook deliveries to localhost and replay recorded
                mailbox events into your handler.
              </p>
            </div>
          </div>
        </section>

        <footer className="py-8 border-t border-[#e7e5e4] mt-4">
          <div className="flex flex-col sm:flex-row items-center justify-between text-sm text-[#52525b] gap-4">
            <div className="flex items-center gap-6">
              <span>© 2026 Mailmon</span>
              <Link href="/terms" className="hover:text-[#1c1917] transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-[#1c1917] transition-colors">
                Privacy
              </Link>
            </div>
            <a
              href="https://status.mailmon.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#1c1917] transition-colors"
            >
              Status
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
