import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Contact } from "../entity/Contact";
import { IsNull } from "typeorm";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { email, phoneNumber } = req.body as {
    email?: string | null;
    phoneNumber?: string | null;
  };

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "email or phoneNumber required" });
  }

  const repo = AppDataSource.getRepository(Contact);

  // Load only active (non-deleted) contacts
  const everyone = await repo.find({ where: { deletedAt: IsNull() } });

  // Seed component by direct match
  let component: Contact[] = everyone.filter(
    (c) => (email && c.email === email) || (phoneNumber && c.phoneNumber === phoneNumber)
  );

  // If nothing matches → create a fresh PRIMARY and return
  if (component.length === 0) {
    const primary = repo.create({
      email: email ?? null,
      phoneNumber: phoneNumber ?? null,
      linkPrecedence: "primary",
    });
    await repo.save(primary);

    return res.json({
      contact: {
        primaryContatctId: primary.id,
        emails: primary.email ? [primary.email] : [],
        phoneNumbers: primary.phoneNumber ? [primary.phoneNumber] : [],
        secondaryContactIds: [],
      },
    });
  }

  // Build transitive closure by shared email/phone + linked relations
  const ids = new Set<number>(component.map((c) => c.id));
  const emails = new Set<string>(component.map((c) => c.email).filter((e): e is string => !!e));
  const phones = new Set<string>(
    component.map((c) => c.phoneNumber).filter((p): p is string => !!p)
  );

  let changed = true;
  while (changed) {
    changed = false;

    // Expand by shared email/phone
    for (const c of everyone) {
      if (ids.has(c.id)) continue;
      if ((c.email && emails.has(c.email)) || (c.phoneNumber && phones.has(c.phoneNumber))) {
        component.push(c);
        ids.add(c.id);
        if (c.email) emails.add(c.email);
        if (c.phoneNumber) phones.add(c.phoneNumber);
        changed = true;
      }
    }

    // Expand by child link (linkedId inside the set)
    for (const c of everyone) {
      if (ids.has(c.id)) continue;
      if (c.linkedId && ids.has(c.linkedId)) {
        component.push(c);
        ids.add(c.id);
        if (c.email) emails.add(c.email);
        if (c.phoneNumber) phones.add(c.phoneNumber);
        changed = true;
      }
    }

    // Expand by parent link (bring in parents)
    for (const c of component.slice()) {
      if (c.linkedId && !ids.has(c.linkedId)) {
        const parent = everyone.find((x) => x.id === c.linkedId);
        if (parent && !ids.has(parent.id)) {
          component.push(parent);
          ids.add(parent.id);
          if (parent.email) emails.add(parent.email);
          if (parent.phoneNumber) phones.add(parent.phoneNumber);
          changed = true;
        }
      }
    }
  }

  // Choose the true primary: oldest createdAt (tie-breaker: lowest id)
  let primary = component[0]!;
  for (const c of component) {
    if (
      c.createdAt < primary.createdAt ||
      (c.createdAt.getTime() === primary.createdAt.getTime() && c.id < primary.id)
    ) {
      primary = c;
    }
  }

  // Does this request introduce "new info"?
  const pairExists = component.some(
    (c) => (c.email ?? null) === (email ?? null) && (c.phoneNumber ?? null) === (phoneNumber ?? null)
  );
  const introducesNewEmail = !!email && !emails.has(email);
  const introducesNewPhone = !!phoneNumber && !phones.has(phoneNumber);

  if (!pairExists && (introducesNewEmail || introducesNewPhone)) {
    const newContact = repo.create({
      email: email ?? null,
      phoneNumber: phoneNumber ?? null,
      linkedId: primary.id,
      linkPrecedence: "secondary",
    });
    await repo.save(newContact);
    component.push(newContact);
    ids.add(newContact.id);
    if (newContact.email) emails.add(newContact.email);
    if (newContact.phoneNumber) phones.add(newContact.phoneNumber);
  }

  // ----------------- REDUNDANCY CLEANUP (soft-delete extras) -----------------
  // Goal: keep a minimal cover of the identity info:
  //  - always keep primary
  //  - prefer secondaries with BOTH email & phone (keep earliest per exact pair)
  //  - then keep earliest records that add a NEW email or NEW phone
  //  - soft-delete any remaining redundant rows

  const active = component.filter((c) => !c.deletedAt);
  // sort oldest first -> deterministic keeping
  active.sort((a, b) => {
    const t = a.createdAt.getTime() - b.createdAt.getTime();
    return t !== 0 ? t : a.id - b.id;
  });

  const keepIds = new Set<number>([primary.id]);
  const keptEmails = new Set<string>(primary.email ? [primary.email] : []);
  const keptPhones = new Set<string>(primary.phoneNumber ? [primary.phoneNumber] : []);
  const keptPairKeys = new Set<string>();

  // First pass: keep earliest with BOTH fields per exact pair
  for (const c of active) {
    if (c.id === primary.id) continue;
    if (c.email && c.phoneNumber) {
      const key = `${c.email}|${c.phoneNumber}`;
      if (!keptPairKeys.has(key)) {
        keptPairKeys.add(key);
        keepIds.add(c.id);
        keptEmails.add(c.email);
        keptPhones.add(c.phoneNumber);
      }
    }
  }

  // Second pass: keep earliest contacts that add NEW email or NEW phone
  for (const c of active) {
    if (keepIds.has(c.id)) continue;
    const addsNewEmail = !!c.email && !keptEmails.has(c.email);
    const addsNewPhone = !!c.phoneNumber && !keptPhones.has(c.phoneNumber);
    if (addsNewEmail || addsNewPhone) {
      keepIds.add(c.id);
      if (c.email) keptEmails.add(c.email);
      if (c.phoneNumber) keptPhones.add(c.phoneNumber);
    }
  }

  // Soft-delete everything else (redundant)
  for (const c of active) {
    if (!keepIds.has(c.id)) {
      c.deletedAt = new Date();
      await repo.save(c);
    }
  }

  // Ensure only one primary, rest secondary (for kept rows)
  const kept = await repo.find({ where: { deletedAt: IsNull() } });
  const related = kept.filter((c) => c.id === primary.id || c.linkedId === primary.id);
  for (const c of related) {
    const shouldBePrimary = c.id === primary.id;
    const desiredLP = shouldBePrimary ? "primary" : "secondary";
    const desiredLinkedId = shouldBePrimary ? null : primary.id;
    if (c.linkPrecedence !== desiredLP || c.linkedId !== desiredLinkedId) {
      c.linkPrecedence = desiredLP;
      c.linkedId = desiredLinkedId;
      await repo.save(c);
    }
  }

  // Final response from non-deleted related set
  const finalSet = await repo.find({ where: { deletedAt: IsNull() } });
  const finalRelated = finalSet.filter((c) => c.id === primary.id || c.linkedId === primary.id);

  const uniqEmails = Array.from(
    new Set(finalRelated.map((c) => c.email).filter((e): e is string => !!e))
  );
  const uniqPhones = Array.from(
    new Set(finalRelated.map((c) => c.phoneNumber).filter((p): p is string => !!p))
  );

  const emailsOut =
    primary.email && uniqEmails.includes(primary.email)
      ? [primary.email, ...uniqEmails.filter((e) => e !== primary.email)]
      : uniqEmails;

  const phonesOut =
    primary.phoneNumber && uniqPhones.includes(primary.phoneNumber)
      ? [primary.phoneNumber, ...uniqPhones.filter((p) => p !== primary.phoneNumber)]
      : uniqPhones;

  const secondaryIds = finalRelated
    .filter((c) => c.linkPrecedence === "secondary")
    .map((c) => c.id);

  return res.json({
    contact: {
      primaryContatctId: primary.id,
      emails: emailsOut,
      phoneNumbers: phonesOut,
      secondaryContactIds: secondaryIds,
    },
  });
});

export default router;
