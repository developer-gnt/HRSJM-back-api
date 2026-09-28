/**
 * HRSJM Backend API — HRSJM integration smoke suite (all implemented phases).
 *
 * Run against a live dev server:
 *   node scripts/test-phases-0-6.mjs
 *
 * Uses the seeded accounts (admin@hrsjm.org / aisha@example.com / rahim@example.com)
 * and creates fresh throw-away users/data per run, so it is safe to re-run.
 */
import "dotenv/config";

const PORT = process.env.APP_PORT || 3000;
const BASE = `http://localhost:${PORT}/${process.env.API_PREFIX || "api/v1"}`;

const ADMIN = { email: "admin@hrsjm.org", password: "Admin@12345" };
const MEMBER = { email: "aisha@example.com", password: "Str0ngP@ss" };
const DONOR = { email: "rahim@example.com", password: "D0norP@ss" };

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, extra) {
  if (condition) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${extra ? ` -> ${extra}` : ""}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function api(path, { method = "GET", token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !form) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* binary or empty body */
  }
  return { status: res.status, data };
}

async function login(credentials) {
  const { status, data } = await api("/auth/login", {
    method: "POST",
    body: { email: credentials.email, password: credentials.password },
  });
  if (!(status >= 200 && status < 300) || !data?.data?.accessToken) {
    throw new Error(`Login failed for ${credentials.email} (${status})`);
  }
  return { token: data.data.accessToken, user: data.data.user };
}

function pdfBlob(text = "%PDF-1.4 hrsjm smoke test") {
  return new Blob([Buffer.from(text, "utf8")], { type: "application/pdf" });
}

function multipart(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    // [blob, filename] tuples get an explicit filename so multer sees originalname
    if (Array.isArray(value)) form.append(key, value[0], value[1]);
    else form.append(key, value);
  }
  return form;
}

async function main() {
  console.log(`Testing HRSJM API at ${BASE}\n`);

  // ---------- PHASE 0 ----------
  section("Phase 0 — Foundation & health");
  {
    const { status, data } = await api("/health");
    check("health returns 200", status === 200);
    check("health envelope shape {success,message,data}", data?.success === true && "message" in data && "data" in data);
    check("health reports ok", data?.data?.status === "ok");
  }

  // ---------- PHASE 1 ----------
  section("Phase 1 — Auth & Users (RBAC)");
  const suffix = Date.now();
  const freshMember = { email: `smoke${suffix}@example.com`, password: "Sm0keT3st!", fullName: "Smoke Tester" };
  let adminToken, memberToken, donorToken, freshToken, freshUserId;
  try {
    const reg = await api("/auth/register", { method: "POST", body: freshMember });
    check("register new member succeeds", reg.status >= 200 && reg.status < 300, `status ${reg.status}`);
    freshUserId = reg.data?.data?.user?.id;
    check("register returns user without password hash", !!freshUserId && !("passwordHash" in (reg.data?.data?.user ?? {})));

    const dup = await api("/auth/register", { method: "POST", body: freshMember });
    check("duplicate register rejected (409)", dup.status === 409, `status ${dup.status}`);

    const badLogin = await api("/auth/login", { method: "POST", body: { email: freshMember.email, password: "WrongPass1" } });
    check("wrong password rejected (401)", badLogin.status === 401, `status ${badLogin.status}`);

    const freshLogin = await login(freshMember);
    freshToken = freshLogin.token;
    check("fresh member login succeeds", !!freshToken);

    const me = await api("/auth/me", { token: freshToken });
    check("GET /auth/me returns current user", me.status === 200 && me.data?.data?.email === freshMember.email);

    const noAuth = await api("/users");
    check("users list without token rejected (401)", noAuth.status === 401, `status ${noAuth.status}`);

    ({ token: adminToken } = await login(ADMIN));
    ({ token: memberToken } = await login(MEMBER));
    ({ token: donorToken } = await login(DONOR));

    const memberList = await api("/users", { token: memberToken });
    check("member cannot list users (403)", memberList.status === 403, `status ${memberList.status}`);

    const adminList = await api("/users?page=1&limit=5", { token: adminToken });
    check("admin lists users with pagination meta", adminList.status === 200 && adminList.data?.data?.meta?.totalPages >= 1);

    const suspend = await api(`/users/${freshUserId}/status`, { method: "PATCH", token: adminToken, body: { status: "SUSPENDED" } });
    check("admin can suspend user", suspend.status === 200 && suspend.data?.data?.status === "SUSPENDED");
    const suspendedLogin = await api("/auth/login", { method: "POST", body: { email: freshMember.email, password: freshMember.password } });
    check("suspended user cannot login (403)", suspendedLogin.status === 403, `status ${suspendedLogin.status}`);
    const reactivate = await api(`/users/${freshUserId}/status`, { method: "PATCH", token: adminToken, body: { status: "ACTIVE" } });
    check("admin can reactivate user", reactivate.status === 200 && reactivate.data?.data?.status === "ACTIVE");

    const selfAccess = await api(`/users/${freshUserId}`, { token: freshToken });
    check("user can view own profile", selfAccess.status === 200 && selfAccess.data?.data?.email === freshMember.email);
    const crossAccess = await api(`/users/${freshUserId}`, { token: memberToken });
    check("member cannot view another user (403)", crossAccess.status === 403, `status ${crossAccess.status}`);
  } catch (err) {
    check("phase 1 flow", false, err.message);
  }

  // ---------- PHASE 2 ----------
  section("Phase 2 — Membership Core & Digital ID");
  let membershipNumber;
  try {
    const create = await api("/admin/memberships", {
      method: "POST",
      token: adminToken,
      body: { userId: freshUserId, category: "REGULAR" },
    });
    check("admin creates REGULAR membership", create.status >= 200 && create.status < 300, `status ${create.status}`);
    membershipNumber = create.data?.data?.membershipNumber;
    check("membership number format HRSJM-YYYY-#####", /^HRSJM-\d{4}-\d{5}$/.test(membershipNumber ?? ""), membershipNumber);
    check("membership active with 1y expiry", create.data?.data?.status === "ACTIVE" && !!create.data?.data?.expiryDate);

    const dupMembership = await api("/admin/memberships", {
      method: "POST",
      token: adminToken,
      body: { userId: freshUserId, category: "REGULAR" },
    });
    check("duplicate membership rejected (409)", dupMembership.status === 409, `status ${dupMembership.status}`);

    const memberCreate = await api("/admin/memberships", {
      method: "POST",
      token: memberToken,
      body: { userId: freshUserId, category: "REGULAR" },
    });
    check("member cannot create membership (403)", memberCreate.status === 403, `status ${memberCreate.status}`);

    const list = await api("/admin/memberships?status=ACTIVE&page=1&limit=10", { token: adminToken });
    check("admin lists memberships with filter", list.status === 200 && list.data?.data?.items?.some((m) => m.membershipNumber === membershipNumber));

    const badUser = await api("/admin/memberships", {
      method: "POST",
      token: adminToken,
      body: { userId: "11111111-1111-4111-8111-111111111111", category: "REGULAR" },
    });
    check("membership for unknown user rejected (404)", badUser.status === 404, `status ${badUser.status}`);

    const lookup = await api(`/membership-id/${membershipNumber}`, { token: memberToken });
    check("digital ID lookup works", lookup.status === 200 && lookup.data?.data?.membershipNumber === membershipNumber);

    const validate = await api(`/membership-id/${membershipNumber}/validate`);
    check("public validate works without token", validate.status === 200 && validate.data?.data?.valid === true);

    const unknown = await api("/membership-id/HRSJM-1999-99999/validate");
    check("unknown membership 404", unknown.status === 404, `status ${unknown.status}`);
  } catch (err) {
    check("phase 2 flow", false, err.message);
  }

  // ---------- PHASE 4 ----------
  section("Phase 4 — Documents / File Management");
  let documentId;
  const pdfText = `%PDF-1.4 hrsjm smoke ${suffix}`;
  try {
    const upload = await api("/documents", {
      method: "POST",
      token: memberToken,
      form: multipart({ file: [new Blob([Buffer.from(pdfText)], { type: "application/pdf" }), "proof.pdf"], documentName: "Smoke proof", documentType: "MEMBERSHIP_DOCUMENT" }),
    });
    check("member uploads PDF (201)", upload.status === 201, `status ${upload.status} ${JSON.stringify(upload.data)}`);
    documentId = upload.data?.data?.id;
    check("upload returns safe metadata (no storage path leak)", !!documentId && !("storagePath" in (upload.data?.data ?? {})));

    const badExt = await api("/documents", {
      method: "POST",
      token: memberToken,
      form: multipart({ file: [new Blob([Buffer.from("hello")], { type: "text/plain" }), "note.txt"], documentName: "Note", documentType: "OTHER" }),
    });
    check("disallowed extension rejected (400)", badExt.status === 400, `status ${badExt.status}`);

    const myList = await api("/documents", { token: memberToken });
    check("member lists own documents", myList.status === 200 && myList.data?.data?.items?.some((d) => d.id === documentId));

    const adminList = await api("/documents", { token: adminToken });
    check("admin list includes owner info", adminList.status === 200 && adminList.data?.data?.items?.some((d) => d.id === documentId && d.owner?.email === MEMBER.email));

    const download = await fetch(`${BASE}/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${memberToken}` } });
    const bytes = Buffer.from(await download.arrayBuffer()).toString("utf8");
    check("owner downloads file with original content", download.status === 200 && bytes === pdfText);

    const donorDownload = await fetch(`${BASE}/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${donorToken}` } });
    check("other user download rejected (403)", donorDownload.status === 403, `status ${donorDownload.status}`);

    const archive = await api(`/documents/${documentId}`, { method: "DELETE", token: memberToken });
    check("owner archives document", archive.status === 200 && archive.data?.data?.isArchived === true);
    const afterArchive = await fetch(`${BASE}/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${memberToken}` } });
    check("archived document download rejected (404)", afterArchive.status === 404, `status ${afterArchive.status}`);
  } catch (err) {
    check("phase 4 flow", false, err.message);
  }

  // ---------- PHASE 5 ----------
  section("Phase 5 — Assistance Requests");
  let requestId;
  try {
    const create = await api("/assistance-requests", {
      method: "POST",
      token: memberToken,
      body: { fullName: "Aisha Rahman", mobile: "+8801712345678", email: MEMBER.email, requestedAmount: "5000.00", reason: "Smoke test assistance reason" },
    });
    check("member submits assistance request", create.status === 201, `status ${create.status}`);
    requestId = create.data?.data?.id;
    check("request starts PENDING", create.data?.data?.status === "PENDING");

    const mine = await api("/assistance-requests/me", { token: memberToken });
    check("member sees own requests", mine.status === 200 && mine.data?.data?.items?.some((r) => r.id === requestId));

    const donorView = await api(`/assistance-requests/${requestId}`, { token: donorToken });
    check("other user access rejected (403)", donorView.status === 403, `status ${donorView.status}`);

    const adminList = await api("/assistance-requests?status=PENDING", { token: adminToken });
    check("admin list shows owner info", adminList.status === 200 && adminList.data?.data?.items?.some((r) => r.id === requestId && r.owner?.email === MEMBER.email));

    const memberReview = await api(`/assistance-requests/${requestId}/status`, { method: "PATCH", token: memberToken, body: { status: "UNDER_REVIEW" } });
    check("member cannot review (403)", memberReview.status === 403, `status ${memberReview.status}`);

    const review = await api(`/assistance-requests/${requestId}/status`, { method: "PATCH", token: adminToken, body: { status: "UNDER_REVIEW", adminRemark: "Verifying documents" } });
    check("admin moves to UNDER_REVIEW with remark", review.status === 200 && review.data?.data?.status === "UNDER_REVIEW" && review.data?.data?.adminRemark === "Verifying documents");

    const approve = await api(`/assistance-requests/${requestId}/status`, { method: "PATCH", token: adminToken, body: { status: "APPROVED", adminRemark: "Approved for smoke test" } });
    check("admin approves request", approve.status === 200 && approve.data?.data?.status === "APPROVED");

    const postDecision = await api(`/assistance-requests/${requestId}/status`, { method: "PATCH", token: adminToken, body: { status: "UNDER_REVIEW" } });
    check("terminal state locked (400)", postDecision.status === 400, `status ${postDecision.status}`);

    const attach = await api(`/assistance-requests/${requestId}/documents`, {
      method: "POST",
      token: memberToken,
      form: multipart({ file: [pdfBlob(), "supporting-doc.pdf"], documentName: "Supporting doc" }),
    });
    check("owner attaches supporting document", attach.status === 201 && attach.data?.data?.relatedEntityType === "ASSISTANCE_REQUEST" && attach.data?.data?.relatedEntityId === requestId);
  } catch (err) {
    check("phase 5 flow", false, err.message);
  }

  // ---------- PHASE 6 ----------
  section("Phase 6 — Support / Complaints");
  let ticketId;
  try {
    const create = await api("/support-tickets", {
      method: "POST",
      token: memberToken,
      body: { subject: `Smoke ticket ${suffix}`, description: "Automated lifecycle test ticket." },
    });
    check("member creates ticket (201)", create.status === 201, `status ${create.status}`);
    ticketId = create.data?.data?.id;
    check("ticket starts SUBMITTED", create.data?.data?.status === "SUBMITTED");

    const mine = await api("/support-tickets/me", { token: memberToken });
    check("member sees own tickets", mine.status === 200 && mine.data?.data?.items?.some((t) => t.id === ticketId));

    const donorView = await api(`/support-tickets/${ticketId}`, { token: donorToken });
    check("other user ticket access rejected (403)", donorView.status === 403, `status ${donorView.status}`);
    const donorMessages = await api(`/support-tickets/${ticketId}/messages`, { token: donorToken });
    check("other user messages access rejected (403)", donorMessages.status === 403, `status ${donorMessages.status}`);

    const adminList = await api("/support-tickets?status=SUBMITTED", { token: adminToken });
    check("admin list shows owner info", adminList.status === 200 && adminList.data?.data?.items?.some((t) => t.id === ticketId && t.owner?.email === MEMBER.email));

    const adminMsg = await api(`/support-tickets/${ticketId}/messages`, { method: "POST", token: adminToken, body: { body: "Thanks, we are looking into it." } });
    check("admin message auto-moves ticket to UNDER_REVIEW", adminMsg.status === 201 && adminMsg.data?.data?.ticketStatus === "UNDER_REVIEW");

    const memberMsg = await api(`/support-tickets/${ticketId}/messages`, { method: "POST", token: memberToken, body: { body: "Additional detail from my side." } });
    check("owner replies on thread", memberMsg.status === 201);

    const thread = await api(`/support-tickets/${ticketId}/messages`, { token: memberToken });
    check("thread lists messages in order (2)", thread.status === 200 && thread.data?.data?.items?.length === 2);

    const memberStatus = await api(`/support-tickets/${ticketId}/status`, { method: "PATCH", token: memberToken, body: { status: "RESOLVED" } });
    check("member cannot change status (403)", memberStatus.status === 403, `status ${memberStatus.status}`);

    const resolve = await api(`/support-tickets/${ticketId}/status`, { method: "PATCH", token: adminToken, body: { status: "RESOLVED", note: "Fixed in latest build." } });
    check("admin resolves with note -> resolvedAt set", resolve.status === 200 && !!resolve.data?.data?.resolvedAt);

    const close = await api(`/support-tickets/${ticketId}/status`, { method: "PATCH", token: adminToken, body: { status: "CLOSED" } });
    check("admin closes resolved ticket", close.status === 200 && close.data?.data?.status === "CLOSED");

    const reopen = await api(`/support-tickets/${ticketId}/status`, { method: "PATCH", token: adminToken, body: { status: "RESOLVED" } });
    check("closed ticket locked (400)", reopen.status === 400, `status ${reopen.status}`);

    const attach = await api(`/support-tickets/${ticketId}/attachments`, {
      method: "POST",
      token: memberToken,
      form: multipart({ file: [pdfBlob(), "ticket-doc.pdf"] }),
    });
    check("owner attaches file to ticket", attach.status === 201 && attach.data?.data?.relatedEntityType === "SUPPORT_TICKET" && attach.data?.data?.relatedEntityId === ticketId);
  } catch (err) {
    check("phase 6 flow", false, err.message);
  }

  // ---------- PHASE 7 ----------
  section("Phase 7 — Notifications");
  const notifTitle = `Smoke broadcast ${suffix}`;
  const specificTitle = `Smoke donor note ${suffix}`;
  const scheduledTitle = `Smoke scheduled ping ${suffix}`;
  const findInFeed = async (token, title, unreadOnly = false) => {
    // Recipient rows are newest-first, so a recent broadcast lands on page 1
    // unless earlier runs left a large unread backlog behind it.
    for (let page = 1; page <= 4; page++) {
      const feed = await api(`/notifications/me?page=${page}&limit=50${unreadOnly ? "&unreadOnly=true" : ""}`, { token });
      const items = feed.data?.data?.items ?? [];
      const hit = items.find((i) => i.notification?.title === title);
      if (hit) return { hit, feed };
      if (items.length < 50) return { hit: null, feed };
    }
    return { hit: null, feed: null };
  };
  try {
    // RBAC
    const memberSend = await api("/notifications", { method: "POST", token: memberToken, body: { title: "x", body: "y", targetAudience: "ALL_USERS" } });
    check("member cannot send notification (403)", memberSend.status === 403, `status ${memberSend.status}`);
    const memberListAll = await api("/notifications", { token: memberToken });
    check("member cannot list all notifications (403)", memberListAll.status === 403, `status ${memberListAll.status}`);

    // Audience fan-out to every active MEMBER
    const beforeFeed = await api("/notifications/me?limit=1", { token: memberToken });
    const beforeUnread = beforeFeed.data?.data?.unreadCount ?? 0;

    const broadcast = await api("/notifications", {
      method: "POST",
      token: adminToken,
      body: { title: notifTitle, body: "Broadcast to all members.", targetAudience: "MEMBERS" },
    });
    check("admin sends notification to MEMBERS (201)", broadcast.status === 201 && broadcast.data?.data?.status === "SENT", `status ${broadcast.status}`);
    check("fan-out counted >= 2 members", broadcast.data?.data?.recipientCount >= 2, `got ${broadcast.data?.data?.recipientCount}`);

    const { hit: feedHit, feed: afterFeedData } = await findInFeed(memberToken, notifTitle);
    check("member feed contains the broadcast", !!feedHit);
    check("feed item starts unread", feedHit?.isRead === false && feedHit?.readAt === null);
    check("unreadCount grew by at least 1", (afterFeedData?.data?.data?.unreadCount ?? 0) >= beforeUnread + 1, `before ${beforeUnread}, after ${afterFeedData?.data?.data?.unreadCount}`);

    const unreadOnly = await api("/notifications/me?limit=50&unreadOnly=true", { token: memberToken });
    check("unreadOnly filter returns the broadcast", (unreadOnly.data?.data?.items ?? []).some((i) => i.notification?.title === notifTitle));

    // Read state lifecycle
    const markRead = await api(`/notifications/recipients/${feedHit.id}/read`, { method: "PATCH", token: memberToken });
    check("mark one notification read", markRead.status === 200 && !!markRead.data?.data?.readAt);
    const afterReadFeed = await api("/notifications/me?limit=1", { token: memberToken });
    check("unreadCount dropped by 1 after read", afterReadFeed.data?.data?.unreadCount === afterFeedData.data.data.unreadCount - 1, `${afterFeedData.data.data.unreadCount - 1} vs ${afterReadFeed.data?.data?.unreadCount}`);
    const crossRead = await api(`/notifications/recipients/${feedHit.id}/read`, { method: "PATCH", token: donorToken });
    check("other user cannot mark my notification read (404)", crossRead.status === 404, `status ${crossRead.status}`);

    // SPECIFIC_USER targeting
    const donorUser = await login(DONOR);
    const specific = await api("/notifications", {
      method: "POST",
      token: adminToken,
      body: { title: specificTitle, body: "Personal donor message.", targetAudience: "SPECIFIC_USER", userIds: [donorUser.user.id] },
    });
    check("admin sends SPECIFIC_USER notification (201)", specific.status === 201 && specific.data?.data?.recipientCount === 1, `status ${specific.status}`);
    const donorFeed = await findInFeed(donorToken, specificTitle);
    check("donor feed contains targeted notification", !!donorFeed.hit);
    const memberSees = await findInFeed(memberToken, specificTitle);
    check("member feed does NOT contain targeted notification", !memberSees.hit);

    const badSpecific = await api("/notifications", {
      method: "POST",
      token: adminToken,
      body: { title: "No ids", body: "Should fail.", targetAudience: "SPECIFIC_USER" },
    });
    check("SPECIFIC_USER without userIds rejected (400)", badSpecific.status === 400, `status ${badSpecific.status}`);
    const bogusSpecific = await api("/notifications", {
      method: "POST",
      token: adminToken,
      body: { title: "Bogus ids", body: "Should fail.", targetAudience: "SPECIFIC_USER", userIds: ["00000000-0000-4000-8000-000000000000"] },
    });
    check("SPECIFIC_USER with unknown user rejected (400)", bogusSpecific.status === 400, `status ${bogusSpecific.status}`);

    // Admin views + recipient read state
    const adminList = await api("/notifications?page=1&limit=100", { token: adminToken });
    const listed = (adminList.data?.data?.items ?? []).find((n) => n.title === notifTitle);
    check("admin list shows notification with recipientCount", !!listed && listed.recipientCount >= 2, `status ${adminList.status}`);
    const recipients = await api(`/notifications/${listed?.id}/recipients`, { token: adminToken });
    check("admin views recipients with read state", recipients.status === 200 && (recipients.data?.data?.items ?? []).some((r) => r.readAt !== null) && (recipients.data?.data?.items ?? []).every((r) => r.user?.id));

    // Scheduled sends (ticker picks up due notifications)
    const scheduledAt = new Date(Date.now() + 3000).toISOString();
    const scheduled = await api("/notifications", {
      method: "POST",
      token: adminToken,
      body: { title: scheduledTitle, body: "Scheduled donor ping.", targetAudience: "DONORS", scheduledAt },
    });
    check("scheduling returns SCHEDULED with sentAt null", scheduled.status === 201 && scheduled.data?.data?.status === "SCHEDULED" && scheduled.data?.data?.sentAt === null, `status ${scheduled.status}`);
    const donorEarly = await findInFeed(donorToken, scheduledTitle);
    check("scheduled notification not in feed before send", !donorEarly.hit);

    let sent = false;
    for (let i = 0; i < 15 && !sent; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const list = await api("/notifications?page=1&limit=100&status=SENT", { token: adminToken });
      sent = (list.data?.data?.items ?? []).some((n) => n.title === scheduledTitle && n.sentAt);
    }
    check("ticker dispatches scheduled notification", sent);
    const donorLate = await findInFeed(donorToken, scheduledTitle);
    check("scheduled notification lands in donor feed", !!donorLate.hit);

    // Mark all read
    const readAll = await api("/notifications/me/read-all", { method: "PATCH", token: memberToken });
    check("mark all read returns updated count", readAll.status === 200);
    const zeroFeed = await api("/notifications/me?limit=1", { token: memberToken });
    check("unreadCount is 0 after read-all", zeroFeed.data?.data?.unreadCount === 0, `got ${zeroFeed.data?.data?.unreadCount}`);
  } catch (err) {
    check("phase 7 flow", false, err.message);
  }

  // ---------- PHASE 8 ----------
  section("Phase 8 — Admin / Member Management");
  try {
    const memberLogin = await login(MEMBER);
    const memberId = memberLogin.user.id;

    const memberDash = await api("/admin/dashboard", { token: memberToken });
    check("member cannot open dashboard (403)", memberDash.status === 403, `status ${memberDash.status}`);

    const dash = await api("/admin/dashboard", { token: adminToken });
    check("admin dashboard returns 200", dash.status === 200);
    check("dashboard has all aggregate sections", !!dash.data?.data?.users?.byRole && !!dash.data?.data?.memberships?.byStatus && !!dash.data?.data?.renewals?.payments && !!dash.data?.data?.assistance?.byStatus && !!dash.data?.data?.tickets?.byStatus);
    check("dashboard counts members >= 2", dash.data?.data?.users?.byRole?.MEMBER >= 2, `got ${dash.data?.data?.users?.byRole?.MEMBER}`);
    check("dashboard counts donors >= 1", dash.data?.data?.users?.byRole?.DONOR >= 1, `got ${dash.data?.data?.users?.byRole?.DONOR}`);
    check("dashboard memberships total >= 1", dash.data?.data?.memberships?.total >= 1, `got ${dash.data?.data?.memberships?.total}`);

    const memberListForbidden = await api("/admin/members", { token: memberToken });
    check("member cannot list members (403)", memberListForbidden.status === 403, `status ${memberListForbidden.status}`);

    const searchSelf = await api(`/admin/members?search=${encodeURIComponent(freshMember.email)}`, { token: adminToken });
    check("search finds fresh member with membership snapshot key", searchSelf.status === 200 && (searchSelf.data?.data?.items ?? []).some((u) => u.email === freshMember.email && "membership" in u));

    const donorFilter = await api("/admin/members?role=DONOR", { token: adminToken });
    check("role filter returns only donors", donorFilter.status === 200 && (donorFilter.data?.data?.items ?? []).length >= 1 && (donorFilter.data?.data?.items ?? []).every((u) => u.role === "DONOR"));

    const memberFilter = await api("/admin/members?role=MEMBER", { token: adminToken });
    check("role filter returns only members", memberFilter.status === 200 && (memberFilter.data?.data?.items ?? []).every((u) => u.role === "MEMBER") && (memberFilter.data?.data?.items ?? []).length >= 1);

    const adminNotInList = await api("/admin/members?search=admin", { token: adminToken });
    check("admin accounts excluded by default", (adminNotInList.data?.data?.items ?? []).every((u) => u.role !== "ADMIN"));

    const view360 = await api(`/admin/members/${memberId}`, { token: adminToken });
    check("member 360 view returns profile", view360.status === 200 && view360.data?.data?.profile?.email === MEMBER.email);
    check("360 view has memberships/renewals/assistance/tickets/documents/notifications", !!view360.data?.data?.memberships && !!view360.data?.data?.renewals && !!view360.data?.data?.assistanceRequests && !!view360.data?.data?.tickets && !!view360.data?.data?.documents && !!view360.data?.data?.notifications);
    check("360 view hides password hash", !("passwordHash" in (view360.data?.data?.profile ?? {})));

    const notFound = await api("/admin/members/00000000-0000-4000-8000-000000000000", { token: adminToken });
    check("360 view unknown member (404)", notFound.status === 404, `status ${notFound.status}`);

    const memberViews = await api(`/admin/members/${memberId}`, { token: donorToken });
    check("donor cannot open 360 view (403)", memberViews.status === 403, `status ${memberViews.status}`);
  } catch (err) {
    check("phase 8 flow", false, err.message);
  }

  // ---------- SUMMARY ----------
  console.log("\n========================================");
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log("Failed cases:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("========================================");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
