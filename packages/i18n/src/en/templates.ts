/**
 * The « templates » slice of the EN catalogue: the starter routines and skills. The
 * `prompt` pre-fills the person's message — it is read and edited, so it is translated.
 */
import type { Messages } from "../messages";

export const templates = {
  routines: {
    "comparer-offres": {
      name: "Compare offers online",
      desc: "The browser reads the sites and compares them for you. No account needed.",
      prompt: `On {site 1} and {site 2}, find {what I am looking for}.

1. A comparison table: price, availability, terms.
2. What really differs between the two, in three lines.
3. What the pages do NOT say and would be worth checking.

Read only: don't fill in any forms or sign in to any accounts.`,
    },
    "preparer-journee": {
      name: "Prepare my day",
      desc: "Your meetings, who is in them, and what you need ready.",
      prompt: `Prepare my day on {date}.

1. My meetings in order, with the attendees and the location.
2. For each one: the subject, and what I should have ready.
3. Anything that overlaps, or leaves me no time to travel.`,
    },
    "compte-rendu-reunions": {
      name: "Minutes of my meetings",
      desc: "Decisions and actions from your meeting transcripts.",
      prompt: `Go over my meetings since {date}.

1. For each one: the subject, the attendees, and the decisions taken.
2. The actions that fall to me, with the deadline if one was stated.
3. The topics left open, to put back on the agenda.

Don't add any decision that isn't in the transcripts.`,
    },
    "recherche-notion": {
      name: "Find it in Notion",
      desc: "Searches your pages and answers with the sources.",
      prompt: `Search my Notion workspace for anything about {topic}.

1. The pages found, most relevant first.
2. What each one says about the question, in two lines, with the link.
3. The answer those pages support — and what they do not say.

Read only: don't change anything.`,
    },
    "revue-boite-mail": {
      name: "Review my inbox",
      desc: "Sorts the mail you received and pulls out what needs a reply.",
      prompt: `Review the emails I received since {period, e.g. 6pm yesterday}.

1. What is waiting on a reply from me, most urgent first.
2. What is purely informational, one line each.
3. For the three most urgent, draft a reply.

Send nothing: show me first.`,
    },
    "point-hebdo-slack": {
      name: "Weekly channel recap",
      desc: "Decisions, open questions, and what is addressed to me.",
      prompt: `Review the messages in the {channel} channel from the last {number} days.

- The decisions taken.
- The questions left unanswered.
- What is addressed to me directly.

End with the three things I shouldn't miss.`,
    },
    "point-client": {
      name: "Client status",
      desc: "Gathers the emails and documents about a client, and sums up where things stand.",
      prompt: `Give me a status update on {client}.

1. The latest email exchanges: who wrote what, and when.
2. The documents about them, with their date.
3. What is waiting on me, and what is waiting on them.

End with the next step. Don't add anything that isn't in the emails or the
documents.`,
    },
    "recherche-documents": {
      name: "Find a document",
      desc: "Searches your files and sums up what answers the question.",
      prompt: `Search my files for anything about {topic}.

1. The documents found, most relevant first, with their date.
2. What each one says about the question, in two lines.
3. The answer those documents support — and what they do not say.`,
    },
    "point-paiements": {
      name: "Payment status",
      desc: "Payments received, failed payments and unpaid invoices for the period.",
      prompt: `Give me a status update on my payments since {date}.

1. The total received, and the change from the previous period.
2. The failed or disputed payments, with the reason.
3. The unpaid invoices, oldest first.

Read only: don't create, refund or cancel anything.`,
    },
    "veille-sujet": {
      name: "Monitor a topic",
      desc: "Searches the web and returns a sourced summary.",
      prompt: `Monitor {topic} over the last {number} days.

1. What is new, with the source and the date of each item.
2. What that changes in practice, in three lines.
3. What you did NOT find that would be needed to draw a conclusion.

Cite your sources, and don't conclude anything they don't support.`,
    },
    "revue-depot": {
      name: "Repository review",
      desc: "Open PRs, reviews waiting on you, the most active issues.",
      prompt: `Give me a status update on the {repository} repository.

1. The open pull requests: how long they have been open, and who is waiting on what.
2. The ones waiting on my review.
3. The most active issues of the last {number} days.

One line per item, with the link.`,
    },
    "suivi-projet": {
      name: "Project tracking",
      desc: "What is moving, what is stuck, what has slipped.",
      prompt: `Give me a status update on the {project} project.

- What has been finished since {date}.
- What is in progress, and for how long.
- What is blocked or late, with the reason if one is noted.

End with the risks you see to the deadline.`,
    },
    "erreurs-semaine": {
      name: "This week's errors",
      desc: "The errors on the rise, ranked by impact.",
      prompt: `List the errors reported on {project} since {date}.

1. The new errors, by number of occurrences.
2. The ones rising fastest compared with the previous period.
3. For the top three: where they fire, and what you make of them.`,
    },
  },
  skills: {
    "reponse-email": {
      name: "Professional email reply",
      desc: "Writes a clear reply to an email you received.",
      prompt: `Write a professional reply to the email below.

- Courteous and direct, no filler.
- Address each point raised, in order.
- End with the concrete next step.

The email:
`,
    },
    "resume-document": {
      name: "Document summary",
      desc: "Pulls out the gist, the key points and the decisions to be made.",
      prompt: `Summarize the document below.

1. The gist, in three sentences.
2. The key points, as a list.
3. The decisions to be made or the actions expected, with who does what.

Flag what is missing or ambiguous rather than filling it in.

The document:
`,
    },
    "explication-code": {
      name: "Code explanation",
      desc: "Explains what a piece of code does, step by step.",
      prompt: `Explain the code below.

1. What it does, in two sentences.
2. The flow, step by step.
3. The edge cases and the risks you spot.

The code:
`,
    },
    "lecture-contrat": {
      name: "Contract review",
      desc: "Spots commitments, deadlines and risky clauses.",
      prompt: `Analyze the contract below.

- Each party's commitments.
- The durations, deadlines, notice periods and renewals.
- The unusual or risky clauses, and why.
- The points to have clarified before signing.

Flag clearly the points that need closer legal review.

The contract:
`,
    },
    "reponse-client": {
      name: "Reply to an unhappy customer",
      desc: "Acknowledge, explain, offer — without getting defensive.",
      prompt: `Write a reply to the customer message below.

- Acknowledge the problem without making excuses.
- Explain what happened, simply.
- Offer a concrete solution and a date.
- Calm and human in tone, never defensive.

The customer's message:
`,
    },
    relecture: {
      name: "Proofreading",
      desc: "Fixes the language and lightens the style, leaving the substance alone.",
      prompt: `Proofread the text below.

- Fix the spelling, grammar and punctuation.
- Lighten heavy sentences without changing the meaning or the tone.
- Give the corrected version first, then the list of notable changes.

The text:
`,
    },
    "compte-rendu": {
      name: "Meeting minutes",
      desc: "Turns raw notes into structured minutes.",
      prompt: `Turn these meeting notes into minutes.

- Context and attendees.
- Topics covered, one short paragraph each.
- Decisions taken.
- Actions: what, who, by when.

Add no decision that does not appear in the notes.

The notes:
`,
    },
    traduction: {
      name: "Translation FR ⇄ EN",
      desc: "Translates while keeping the tone and the technical terms.",
      prompt: `Translate the text below into the other language (French ⇄ English).

- Keep the original tone and register.
- Preserve the formatting, the proper nouns and the technical terms.
- At the end, flag the ambiguous passages and the choices you had to make.

The text:
`,
    },
  },
  generic: {
    name: (service) => `Status update on ${service}`,
    desc: (what) => `Suggested routine: ${what}`,
    prompt: (service) => `Give me a status update on {what I care about} in ${service}.

1. What you find, most relevant first, with its date.
2. What each item says, in two lines.
3. What is waiting on an action from me.

Read only: create nothing, change nothing, send nothing.`,
  },
} satisfies Messages["templates"];
