"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AtSign, Camera, Check, FileText, Mail, Pencil, ShieldCheck, UserRound, X } from "lucide-react";

export type ProfileSettingsInitialData = {
  fullName: string;
  email: string;
  username: string;
  bio: string;
  avatarUrl: string;
  storageMode: "browser";
};

type ProfileFormState = {
  fullName: string;
  email: string;
  username: string;
  bio: string;
  avatarUrl: string;
};

const STORAGE_KEY = "clipperviral.profile.v1";
const BIO_LIMIT = 220;

function normalizeProfile(data: Partial<ProfileFormState> | null | undefined): ProfileFormState {
  return {
    fullName: data?.fullName?.trim() || "",
    email: data?.email?.trim() || "",
    username: data?.username?.trim().replace(/^@+/, "") || "",
    bio: (data?.bio || "").slice(0, BIO_LIMIT),
    avatarUrl: data?.avatarUrl || "",
  };
}

function getInitials(name: string, email: string) {
  const source = name.trim() || email.trim() || "ClipperViral";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function profilesMatch(first: ProfileFormState, second: ProfileFormState) {
  return JSON.stringify(normalizeProfile(first)) === JSON.stringify(normalizeProfile(second));
}

function getSetupItems(profile: ProfileFormState) {
  return [
    Boolean(profile.fullName),
    Boolean(profile.email),
    Boolean(profile.username),
    Boolean(profile.bio),
    Boolean(profile.avatarUrl),
  ];
}

function isValidEmail(email: string) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const CTA_GRADIENT = "bg-[linear-gradient(135deg,#e35de0,#d63bdc_48%,#c423e3)]";
const PROGRESS_GRADIENT = "bg-[linear-gradient(90deg,#e35de0,#c423e3)]";

export function ProfileSettingsClient({ initialData }: { initialData: ProfileSettingsInitialData }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initialProfile = useMemo(() => normalizeProfile(initialData), [initialData]);
  const [savedProfile, setSavedProfile] = useState<ProfileFormState>(initialProfile);
  const [draft, setDraft] = useState<ProfileFormState>(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState("Profile details are saved on this browser for now.");
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = normalizeProfile(JSON.parse(stored));
      const merged = normalizeProfile({ ...initialProfile, ...parsed });
      setSavedProfile(merged);
      setDraft(merged);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [initialProfile]);

  // Purely-visual auto-fade for the status toast.
  useEffect(() => {
    if (!status) return;
    setToastVisible(true);
    const id = window.setTimeout(() => setToastVisible(false), 4000);
    return () => window.clearTimeout(id);
  }, [status]);

  const visibleProfile = isEditing ? draft : savedProfile;
  const displayName = visibleProfile.fullName || "Your profile";
  const usernameLabel = visibleProfile.username ? `@${visibleProfile.username}` : "Add a username";
  const secondaryIdentity = visibleProfile.email || usernameLabel || "Add your account details";
  const initials = getInitials(visibleProfile.fullName, visibleProfile.email);
  const completedSetup = getSetupItems(savedProfile).filter(Boolean).length;
  const isDirty = !profilesMatch(draft, savedProfile);
  const emailHasError = isEditing && draft.email.length > 0 && !isValidEmail(draft.email);

  function updateField(field: keyof ProfileFormState, value: string) {
    setDraft((current) => ({ ...current, [field]: field === "bio" ? value.slice(0, BIO_LIMIT) : value }));
  }

  function handleEdit() {
    setDraft(savedProfile);
    setIsEditing(true);
    setStatus("Editing profile details.");
  }

  function handleCancel() {
    setDraft(savedProfile);
    setIsEditing(false);
    setStatus("No changes saved.");
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = normalizeProfile(draft);
    if (!isValidEmail(next.email)) {
      setStatus("Enter a valid email address before saving.");
      return;
    }
    setSavedProfile(next);
    setDraft(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setIsEditing(false);
    setStatus("Profile updated on this browser.");
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Choose an image file for the profile photo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const avatarUrl = typeof reader.result === "string" ? reader.result : "";
      setDraft((current) => ({ ...current, avatarUrl }));
      setIsEditing(true);
      setStatus("Profile photo ready. Save changes to keep it on this browser.");
    };
    reader.readAsDataURL(file);
  }

  function removeAvatar() {
    setDraft((current) => ({ ...current, avatarUrl: "" }));
    setIsEditing(true);
    setStatus("Profile photo removed from the draft. Save changes to keep it.");
  }

  const setupItems: Array<{ label: string; done: boolean }> = [
    { label: "Full name", done: Boolean(savedProfile.fullName) },
    { label: "Email address", done: Boolean(savedProfile.email) },
    { label: "Username", done: Boolean(savedProfile.username) },
    { label: "Short bio", done: Boolean(savedProfile.bio) },
    { label: "Profile photo", done: Boolean(savedProfile.avatarUrl) },
  ];

  const progressPct = (completedSetup / 5) * 100;

  const setupCard = (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-[#86868b]">Setup</div>
        <div className="text-xs font-medium text-[#86868b]">{completedSetup} of 5</div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#eeeef1]">
        <div
          className={`h-full rounded-full ${PROGRESS_GRADIENT} transition-all`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <ul className="mt-4 space-y-2">
        {setupItems.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-sm">
            <span
              className={`grid h-5 w-5 place-items-center rounded-full border ${
                item.done
                  ? "border-transparent bg-[#1d1d1f] text-white"
                  : "border-black/10 bg-white text-transparent"
              }`}
              aria-hidden="true"
            >
              <Check className="h-3 w-3" />
            </span>
            <span className={item.done ? "text-[#1d1d1f]" : "text-[#86868b]"}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* Left rail (desktop) */}
      <aside className="hidden lg:flex lg:flex-col lg:gap-4">
        <nav className="rounded-2xl border border-black/[0.06] bg-white p-2">
          <div className="flex w-full items-center gap-2.5 rounded-xl bg-[#f5f5f7] px-3 py-2 text-sm font-medium text-[#1d1d1f]">
            <UserRound className="h-4 w-4 text-[#1d1d1f]" />
            Profile
          </div>
          <div className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[#6e6e73]">
            <ShieldCheck className="h-4 w-4 text-[#86868b]" />
            Account
          </div>
        </nav>
        {setupCard}
      </aside>

      {/* Right column */}
      <div className="grid gap-6">
        {/* Identity card */}
        <section className="rounded-2xl border border-black/[0.06] bg-white p-5 sm:p-6">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full items-center gap-4 sm:gap-5">
              <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-[22px] bg-[#f2f2f4] ring-1 ring-black/[0.06] sm:h-24 sm:w-24">
                {visibleProfile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={visibleProfile.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#ffffff,#f3edf9)] text-2xl font-medium text-[#6e6e73] sm:text-3xl">
                    {initials || <UserRound className="h-8 w-8" />}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="Change profile photo"
                >
                  <Camera className="h-5 w-5" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} hidden />
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-xl font-semibold tracking-tight text-[#1d1d1f] sm:text-2xl">
                  {displayName}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#6e6e73]">
                  <span className="truncate">{secondaryIdentity}</span>
                  {visibleProfile.username ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-[#d2d2d7]" aria-hidden="true" />
                      <span className="truncate">{usernameLabel}</span>
                    </>
                  ) : null}
                </div>
                {visibleProfile.bio ? (
                  <p className="mt-2 max-w-xl text-sm leading-6 text-[#424245]">{visibleProfile.bio}</p>
                ) : null}
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              {visibleProfile.avatarUrl && isEditing ? (
                <button
                  type="button"
                  onClick={removeAvatar}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-black/[0.08] bg-white px-4 text-sm font-medium text-[#6e6e73] transition hover:bg-[#f5f5f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c423e3]/40"
                >
                  Remove photo
                </button>
              ) : null}
              {!isEditing ? (
                <button
                  type="button"
                  onClick={handleEdit}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-full ${CTA_GRADIENT} px-4 text-sm font-medium text-white transition hover:brightness-105 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c423e3]/50`}
                >
                  <Pencil className="h-4 w-4" />
                  Edit profile
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {/* Mobile setup card */}
        <section className="lg:hidden">{setupCard}</section>

        {/* Profile details */}
        <section className="rounded-2xl border border-black/[0.06] bg-white p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-[#1d1d1f]">Profile details</h2>
              <p className="mt-0.5 text-sm text-[#6e6e73]">The details people will recognize first.</p>
            </div>
            {isEditing ? (
              <span className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-xs font-medium text-[#1d1d1f]">
                Editing
              </span>
            ) : null}
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <ProfileField
                icon={<UserRound className="h-4 w-4" />}
                label="Full name"
                value={draft.fullName}
                placeholder="Add your name"
                disabled={!isEditing}
                onChange={(value) => updateField("fullName", value)}
              />
              <ProfileField
                icon={<Mail className="h-4 w-4" />}
                label="Email address"
                type="email"
                value={draft.email}
                placeholder="name@example.com"
                disabled={!isEditing}
                error={emailHasError ? "Use a valid email format." : ""}
                onChange={(value) => updateField("email", value)}
              />
            </div>
            <ProfileField
              icon={<AtSign className="h-4 w-4" />}
              label="Username"
              value={draft.username}
              placeholder="Add a username"
              disabled={!isEditing}
              prefix="@"
              helper="Letters, numbers, and a simple handle work best."
              onChange={(value) => updateField("username", value)}
            />
            <label className="grid gap-2">
              <span className="flex items-center gap-2 text-sm font-medium text-[#1d1d1f]">
                <FileText className="h-4 w-4 text-[#86868b]" />
                Bio / About
              </span>
              {isEditing ? (
                <>
                  <textarea
                    value={draft.bio}
                    onChange={(event) => updateField("bio", event.target.value)}
                    placeholder="Add a short bio for your creator profile."
                    rows={4}
                    maxLength={BIO_LIMIT}
                    className="min-h-28 resize-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-sm leading-6 text-[#1d1d1f] outline-none transition placeholder:text-[#a1a1a6] focus:border-[#c423e3]/50 focus:ring-2 focus:ring-[#c423e3]/20"
                  />
                  <span className="text-right text-xs text-[#86868b]">
                    {draft.bio.length}/{BIO_LIMIT}
                  </span>
                </>
              ) : (
                <div className="min-h-11 rounded-xl border border-black/[0.06] bg-[#fafafa] px-3.5 py-2.5 text-sm leading-6 text-[#1d1d1f]">
                  {savedProfile.bio || (
                    <span className="text-[#a1a1a6]">Add a short bio for your creator profile.</span>
                  )}
                </div>
              )}
            </label>
          </div>
        </section>

        {/* Account section */}
        <section className="rounded-2xl border border-black/[0.06] bg-white p-5 sm:p-6">
          <h2 className="mb-4 text-base font-semibold tracking-tight text-[#1d1d1f]">Account</h2>
          <div className="grid gap-1">
            <SettingsRow
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Storage"
              value="Saved on this browser until account storage is connected."
            />
            <SettingsRow
              icon={<UserRound className="h-4 w-4" />}
              label="Sign-in"
              value="Google OAuth and billing settings will be added later."
            />
            <SettingsRow
              icon={<Pencil className="h-4 w-4" />}
              label="Editor"
              value="Use the editor as the home page for creating clips."
            />
          </div>
        </section>

        {/* Spacer so sticky save bar doesn't cover content on mobile */}
        {isEditing ? <div className="h-16 lg:h-0" aria-hidden="true" /> : null}
      </div>

      {/* Sticky save bar (edit mode) */}
      {isEditing ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 lg:col-span-2">
          <div className="pointer-events-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl border border-black/[0.08] bg-white/95 px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.12)] backdrop-blur">
            <span className="text-sm text-[#6e6e73]">
              {isDirty ? "You have unsaved changes." : "No changes yet."}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-4 text-sm font-medium text-[#1d1d1f] transition hover:bg-[#f5f5f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c423e3]/40"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isDirty || emailHasError}
                className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full ${CTA_GRADIENT} px-4 text-sm font-medium text-white transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c423e3]/50`}
              >
                <Check className="h-4 w-4" />
                Save changes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating status toast */}
      <div
        className={`pointer-events-none fixed bottom-4 right-4 z-50 max-w-xs rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-sm text-[#1d1d1f] shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-opacity duration-300 ${
          toastVisible ? "opacity-100" : "opacity-0"
        }`}
        role="status"
        aria-live="polite"
      >
        {status}
      </div>
    </form>
  );
}

function ProfileField({
  icon,
  label,
  value,
  placeholder,
  type = "text",
  disabled,
  prefix,
  helper,
  error,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  disabled: boolean;
  prefix?: string;
  helper?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center gap-2 text-sm font-medium text-[#1d1d1f]">
        <span className="text-[#86868b]">{icon}</span>
        {label}
      </span>
      <span className="relative block">
        {prefix ? (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#86868b]">
            {prefix}
          </span>
        ) : null}
        <input
          type={type}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-[#1d1d1f] outline-none transition placeholder:text-[#a1a1a6] focus:border-[#c423e3]/50 focus:ring-2 focus:ring-[#c423e3]/20 disabled:cursor-default disabled:border-black/[0.06] disabled:bg-[#fafafa] disabled:text-[#1d1d1f] ${
            prefix ? "pl-7" : ""
          } ${error ? "border-[#d92d20]/45 focus:border-[#d92d20]/70 focus:ring-[#d92d20]/15" : "border-black/[0.08]"}`}
        />
      </span>
      {error ? <span className="text-xs font-medium text-[#d92d20]">{error}</span> : null}
      {helper && !error ? <span className="text-xs text-[#86868b]">{helper}</span> : null}
    </label>
  );
}

function SettingsRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-xl px-3 py-3 transition hover:bg-[#fafafa] sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start sm:gap-6">
      <div className="flex items-center gap-2.5 text-sm font-medium text-[#1d1d1f]">
        <span className="text-[#86868b]">{icon}</span>
        {label}
      </div>
      <div className="text-sm leading-6 text-[#6e6e73]">{value}</div>
    </div>
  );
}
