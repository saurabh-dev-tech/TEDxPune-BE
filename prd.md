Here is a summary of the TEDx Pune Community App PRD, viewed through the dual
lenses of product strategy and systems architecture.

1. The Product Lens

Value Proposition: The TEDx Pune Community App is an exclusive, digital
extension of the TEDx physical experience. It solves the "post-event
disconnectedness" problem by providing a localized, LinkedIn-style professional
network for TEDx attendees, speakers, and organizers. Target User: TEDx Pune
community members (networking-focused professionals, thought leaders) and TEDx
Administrators (who need tools to moderate and analyze engagement). Core
Experience: A clean, heavily branded (editorial design system) platform focusing
purely on identity (LinkedIn sync) and conversation (text-based chronological
feed) for its MVP.

2. The Architecture Lens

System Design & Data Flow: The architecture is a standard, robust decoupled
client-server model.

  - Mobile Client: React Native ensures cross-platform (iOS/Android) velocity
    with a shared codebase.
  - Web Admin: Next.js provides a fast, SEO-friendly (if needed later), and
    scalable dashboard.
  - API Gateway/Backend: Node.js with Fastify offers a highly structured,
    enterprise-ready backend using REST APIs, secured via JWT.
  - Data Layer: PostgreSQL is an excellent choice for the highly relational data
    of a social network (Users -> Posts -> Comments/Likes). Cloudinary will
    handle future media assets.
  - Identity: LinkedIn OAuth 2.0 acts as the primary identity provider, reducing
    onboarding friction and establishing a baseline of professional
    authenticity.

3. The Plan (Iterative Delivery)

To ensure quick time-to-market and validate user engagement, the rollout should
be phased:

  - Phase 1: The "Digital Lobby" (MVP):
      - App: LinkedIn Auth, basic profile editing, chronological text-only feed,
        likes, threaded comments, and the member directory.
      - Admin: Basic moderation (delete/block), dashboard metrics, and user
        lists.
  - Phase 2: Rich Engagement & Discovery:
      - Introduce Push/Email notifications (critical for retention), rich media
        posts (Cloudinary integration for images), and advanced filtering (by
        event year, industry).
  - Phase 3: The "Private Room" & Scale:
      - Implement WebSockets for real-time 1:1 chat (E2EE as requested).
      - Introduce multi-tenant architecture on the Admin side if scaling to
        other TEDx chapters.

4. Risks & Mitigations

  - Product Risk - The "Empty Room" Problem: Social networks die without initial
    engagement. Text-only feeds without push notifications in Phase 1 mean users
    might post once, leave, and never know someone replied.
      - Mitigation: Pre-seed the platform with content from TEDx organizers and
        speakers before inviting the general audience.
  - Technical Risk - LinkedIn API Constraints: LinkedIn strictly governs its API
    usage. Simply getting basic profile data (Lite Profile) is standard, but
    deeper integrations require manual LinkedIn approval.
      - Mitigation: Strictly limit reliance on LinkedIn to Authentication and
        Basic Profile Data (Name, Email, Profile Picture). Do not plan on
        syncing job history without verifying API tier access.
  - Security Risk - Threaded Comments DB Performance: Deeply nested comments can
    cause slow, recursive database queries.
      - Mitigation: Limit comment nesting to 1 or 2 levels deep (Comment ->
        Reply) or use the Materialized Path/Closure Table pattern in PostgreSQL.

❓ Clarifying Questions for You

Before we freeze these requirements and move into technical design, I need
clarification on a few strategic points:

1.  Exclusivity & Verification: How are we validating that a user is actually
    part of the TEDx Pune community? If anyone with a LinkedIn account downloads
    the app, can they instantly join, or is there an Admin approval step / email
    allow-list?
2.  The Retention Loop: The MVP (Phase 1) pushes notifications to Phase 2.
    Without push/email notifications, how will users know if someone liked their
    post or replied to their comment? Should we pull basic email notifications
    into Phase 1 to drive users back into the app?
3.  "SaaS-based" Admin Panel: The PRD mentions "SaaS capabilities" and "Future
    Multi-tenancy." Is the long-term product vision to white-label and sell this
    community platform to other TEDx chapters globally (e.g., TEDx NewYork, TEDx
    London)? If so, we must design the database with a tenant_id from Day 1 to
    avoid a massive architectural rewrite later.
4.  Content Moderation: Do we need automated profanity/spam filtering in
    Phase 1, or will the TEDx Pune team rely entirely on manual moderation by
    scanning the admin dashboard?
