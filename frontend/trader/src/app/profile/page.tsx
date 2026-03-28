'use client';



import { useState, useEffect, useCallback } from 'react';

import { clsx } from 'clsx';

import toast from 'react-hot-toast';

import { Button } from '@/components/ui/Button';

import { Card } from '@/components/ui/Card';

import { Tabs } from '@/components/ui/Tabs';

import TopBar from '@/components/layout/TopBar';

import api from '@/lib/api/client';



interface Profile {

  id: string;

  email: string;

  first_name: string;

  last_name: string;

  phone: string;

  country: string;

  kyc_status: string;

  two_factor_enabled: boolean;

  kyc_documents: Array<{

    id: string;

    document_type: string;

    status: string;

    rejection_reason: string | null;

    created_at: string;

  }>;

}



interface Session {

  id: string;

  ip_address: string;

  user_agent: string;

  device_info: string;

  created_at: string;

}



export default function ProfilePage() {

  const [tab, setTab] = useState('profile');

  const [profile, setProfile] = useState<Profile | null>(null);

  const [sessions, setSessions] = useState<Session[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);



  // Profile form

  const [firstName, setFirstName] = useState('');

  const [lastName, setLastName] = useState('');

  const [phone, setPhone] = useState('');

  const [country, setCountry] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);



  // Password form

  const [currentPass, setCurrentPass] = useState('');

  const [newPass, setNewPass] = useState('');

  const [confirmPass, setConfirmPass] = useState('');

  const [changingPassword, setChangingPassword] = useState(false);



  // Sessions

  const [terminatingSession, setTerminatingSession] = useState<string | null>(null);



  // 2FA setup

  const [showTwoFaSetup, setShowTwoFaSetup] = useState(false);

  const [twoFaUri, setTwoFaUri] = useState('');

  const [twoFaCode, setTwoFaCode] = useState('');

  const [settingUp2Fa, setSettingUp2Fa] = useState(false);

  const [verifying2Fa, setVerifying2Fa] = useState(false);



  // KYC upload form

  const [kycDocType, setKycDocType] = useState('passport');

  const [kycFile, setKycFile] = useState<File | null>(null);

  const [kycSubmitting, setKycSubmitting] = useState(false);

  const [showKycForm, setShowKycForm] = useState(false);



  // Notification preferences

  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() => {

    if (typeof window === 'undefined') return {};

    try {

      return JSON.parse(localStorage.getItem('notifPrefs') || '{}');

    } catch {

      return {};

    }

  });



  const toggleNotifPref = (key: string) => {

    setNotifPrefs((prev) => {

      const updated = { ...prev, [key]: !prev[key] };

      localStorage.setItem('notifPrefs', JSON.stringify(updated));

      return updated;

    });

  };



  const handleSetup2Fa = async () => {

    try {

      setSettingUp2Fa(true);

      const res = await api.post<{ otp_uri: string }>('/auth/2fa/setup');

      setTwoFaUri(res.otp_uri);

      setShowTwoFaSetup(true);

    } catch (err: unknown) {

      toast.error(err instanceof Error ? err.message : 'Failed to initiate 2FA setup');

    } finally {

      setSettingUp2Fa(false);

    }

  };



  const handleVerify2Fa = async () => {

    if (!twoFaCode.trim()) {

      toast.error('Please enter the verification code');

      return;

    }

    try {

      setVerifying2Fa(true);

      await api.post('/auth/2fa/verify', { code: twoFaCode });

      toast.success('2FA enabled successfully!');

      setShowTwoFaSetup(false);

      setTwoFaCode('');

      setTwoFaUri('');

      fetchProfile();

    } catch (err: unknown) {

      toast.error(err instanceof Error ? err.message : 'Invalid verification code');

    } finally {

      setVerifying2Fa(false);

    }

  };



  const handleDisable2Fa = async () => {

    try {

      setSettingUp2Fa(true);

      await api.delete('/auth/2fa');

      toast.success('2FA disabled');

      fetchProfile();

    } catch (err: unknown) {

      toast.error(err instanceof Error ? err.message : 'Failed to disable 2FA');

    } finally {

      setSettingUp2Fa(false);

    }

  };



  const fetchProfile = useCallback(async () => {

    try {

      setLoading(true);

      setError(null);

      const data = await api.get<Profile>('/profile');

      setProfile(data);

      setFirstName(data.first_name ?? '');

      setLastName(data.last_name ?? '');

      setPhone(data.phone ?? '');

      setCountry(data.country ?? '');

    } catch (err: unknown) {

      const msg = err instanceof Error ? err.message : 'Failed to load profile';

      setError(msg);

    } finally {

      setLoading(false);

    }

  }, []);



  const fetchSessions = useCallback(async () => {

    try {

      const res = await api.get<{ sessions: Session[] }>('/profile/sessions');

      setSessions(res.sessions ?? []);

    } catch {

      // non-critical

    }

  }, []);



  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  useEffect(() => { if (tab === 'sessions') fetchSessions(); }, [tab, fetchSessions]);



  const handleSaveProfile = async () => {

    try {

      setSavingProfile(true);

      await api.put('/profile', {

        first_name: firstName,

        last_name: lastName,

        phone,

        country,

      });

      toast.success('Profile updated successfully!');

      fetchProfile();

    } catch (err: unknown) {

      toast.error(err instanceof Error ? err.message : 'Failed to update profile');

    } finally {

      setSavingProfile(false);

    }

  };



  const handleChangePassword = async () => {

    if (!currentPass || !newPass) {

      toast.error('Please fill in all password fields');

      return;

    }

    if (newPass !== confirmPass) {

      toast.error('New passwords do not match');

      return;

    }

    try {

      setChangingPassword(true);

      await api.put('/profile/password', {

        current_password: currentPass,

        new_password: newPass,

      });

      toast.success('Password changed successfully!');

      setCurrentPass('');

      setNewPass('');

      setConfirmPass('');

    } catch (err: unknown) {

      toast.error(err instanceof Error ? err.message : 'Failed to change password');

    } finally {

      setChangingPassword(false);

    }

  };



  const handleSubmitKyc = async () => {

    if (!kycFile) { toast.error('Please select a file'); return; }

    const formData = new FormData();

    formData.append('document_type', kycDocType);

    formData.append('file', kycFile);

    setKycSubmitting(true);

    try {

      const token = api.getToken();

      const res = await fetch('/api/v1/profile/kyc/submit/', {

        method: 'POST',

        headers: token ? { Authorization: `Bearer ${token}` } : {},

        body: formData,

      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.detail || 'Upload failed');

      toast.success(json.message || 'KYC submitted successfully!');

      setKycFile(null);

      setShowKycForm(false);

      fetchProfile();

    } catch (err: unknown) {

      toast.error(err instanceof Error ? err.message : 'Failed to submit KYC');

    } finally {

      setKycSubmitting(false);

    }

  };



  const handleTerminateSession = async (sessionId: string) => {

    try {

      setTerminatingSession(sessionId);

      await api.delete(`/profile/sessions/${sessionId}`);

      toast.success('Session terminated');

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

    } catch (err: unknown) {

      toast.error(err instanceof Error ? err.message : 'Failed to terminate session');

    } finally {

      setTerminatingSession(null);

    }

  };



  const tabs = [

    { id: 'profile', label: 'Profile' },

    { id: 'security', label: 'Security' },

    { id: 'kyc', label: 'KYC' },

    { id: 'notifications', label: 'Notifications' },

    { id: 'sessions', label: 'Sessions' },

  ];



  const kycDocs = profile?.kyc_documents ?? [];



  const kycStatusStyle = (s: string) => {

    const lower = s?.toLowerCase();

    if (lower === 'verified' || lower === 'approved') return 'bg-success/15 text-success';

    if (lower === 'pending' || lower === 'under_review') return 'bg-warning/15 text-warning';

    if (lower === 'rejected') return 'bg-sell/15 text-sell';

    return 'bg-bg-hover text-text-secondary';

  };



  if (loading) {

    return (

      <div className="flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-primary">

        <TopBar />

        <div className="flex-1 flex items-center justify-center">

          <div className="flex flex-col items-center gap-3">

            <div className="w-8 h-8 border-2 border-buy border-t-transparent rounded-full animate-spin" />

            <span className="text-sm text-text-tertiary">Loading profile...</span>

          </div>

        </div>

      </div>

    );

  }



  if (error) {

    return (

      <div className="flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-primary">

        <TopBar />

        <div className="flex-1 flex items-center justify-center">

          <div className="text-center space-y-3">

            <p className="text-sell text-sm">{error}</p>

            <Button variant="outline" size="sm" onClick={fetchProfile}>Retry</Button>

          </div>

        </div>

      </div>

    );

  }



  const initials = `${(profile?.first_name?.[0] ?? '').toUpperCase()}${(profile?.last_name?.[0] ?? '').toUpperCase()}` || 'U';



  return (

    <div className="flex flex-col h-[100dvh] pb-16 md:h-screen md:pb-0 bg-bg-primary">

      <TopBar />



      <div className="page-main space-y-4 sm:space-y-6">

        <h2 className="text-lg font-semibold text-text-primary">Settings</h2>

        <Tabs tabs={tabs} active={tab} onChange={setTab} />



        {tab === 'profile' && (

          <div className="max-w-lg space-y-5">

            <Card variant="glass" padding="lg">

              <div className="flex items-center gap-4 mb-6">

                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-buy/30 to-accent/30 border border-border-glass flex items-center justify-center text-xl font-bold text-text-primary">

                  {initials}

                </div>

                <div>

                  <div className="text-md font-semibold text-text-primary">

                    {profile?.first_name} {profile?.last_name}

                  </div>

                  <div className="text-xs text-text-tertiary">{profile?.email}</div>

                  <div className={clsx('text-[10px] mt-0.5', profile?.kyc_status === 'verified' ? 'text-buy' : 'text-warning')}>

                    {profile?.kyc_status === 'verified' ? 'Verified Account' : `KYC: ${profile?.kyc_status ?? 'unknown'}`}

                  </div>

                </div>

              </div>



              <div className="space-y-4">

                <div className="grid grid-cols-2 gap-3">

                  <div>

                    <label className="text-xs text-text-secondary block mb-1.5 font-medium">First Name</label>

                    <input

                      type="text"

                      value={firstName}

                      onChange={(e) => setFirstName(e.target.value)}

                      className="skeu-input w-full text-text-primary rounded-xl py-3 px-4 text-sm"

                    />

                  </div>

                  <div>

                    <label className="text-xs text-text-secondary block mb-1.5 font-medium">Last Name</label>

                    <input

                      type="text"

                      value={lastName}

                      onChange={(e) => setLastName(e.target.value)}

                      className="skeu-input w-full text-text-primary rounded-xl py-3 px-4 text-sm"

                    />

                  </div>

                </div>

                <div>

                  <label className="text-xs text-text-secondary block mb-1.5 font-medium">Email</label>

                  <input

                    type="email"

                    defaultValue={profile?.email ?? ''}

                    disabled

                    className="skeu-input w-full text-text-tertiary rounded-xl py-3 px-4 text-sm opacity-60 cursor-not-allowed"

                  />

                </div>

                <div>

                  <label className="text-xs text-text-secondary block mb-1.5 font-medium">Phone</label>

                  <input

                    type="tel"

                    value={phone}

                    onChange={(e) => setPhone(e.target.value)}

                    className="skeu-input w-full text-text-primary rounded-xl py-3 px-4 text-sm"

                  />

                </div>

                <div>

                  <label className="text-xs text-text-secondary block mb-1.5 font-medium">Country</label>

                  <input

                    type="text"

                    value={country}

                    onChange={(e) => setCountry(e.target.value)}

                    className="skeu-input w-full text-text-primary rounded-xl py-3 px-4 text-sm"

                  />

                </div>

                <Button variant="primary" onClick={handleSaveProfile} loading={savingProfile}>

                  Save Changes

                </Button>

              </div>

            </Card>

          </div>

        )}



        {tab === 'security' && (

          <div className="max-w-lg space-y-6">

            <Card variant="glass" padding="lg">

              <h3 className="text-md font-semibold text-text-primary flex items-center gap-2 mb-4">

                Change Password

              </h3>

              <div className="space-y-3">

                <div>

                  <label className="text-xs text-text-secondary block mb-1.5 font-medium">Current Password</label>

                  <input

                    type="password"

                    value={currentPass}

                    onChange={(e) => setCurrentPass(e.target.value)}

                    className="skeu-input w-full text-text-primary rounded-xl py-3 px-4 text-sm"

                  />

                </div>

                <div>

                  <label className="text-xs text-text-secondary block mb-1.5 font-medium">New Password</label>

                  <input

                    type="password"

                    value={newPass}

                    onChange={(e) => setNewPass(e.target.value)}

                    className="skeu-input w-full text-text-primary rounded-xl py-3 px-4 text-sm"

                  />

                </div>

                <div>

                  <label className="text-xs text-text-secondary block mb-1.5 font-medium">Confirm New Password</label>

                  <input

                    type="password"

                    value={confirmPass}

                    onChange={(e) => setConfirmPass(e.target.value)}

                    className="skeu-input w-full text-text-primary rounded-xl py-3 px-4 text-sm"

                  />

                </div>

                <Button variant="primary" onClick={handleChangePassword} loading={changingPassword}>

                  Update Password

                </Button>

              </div>

            </Card>



            <Card variant="glass" padding="lg">

              <h3 className="text-md font-semibold text-text-primary flex items-center gap-2 mb-2">

                Two-Factor Authentication

              </h3>

              <p className="text-sm text-text-tertiary mb-4">Add an extra layer of security to your account.</p>



              {showTwoFaSetup ? (

                <div className="space-y-4">

                  <div className="bg-bg-tertiary rounded-lg p-4 border border-border-glass">

                    <p className="text-xs text-text-secondary mb-2">Scan this URI in your authenticator app (Google Authenticator, Authy, etc.):</p>

                    <div className="font-mono text-xs text-text-primary break-all bg-bg-primary rounded-lg p-3 border border-border-glass select-all">

                      {twoFaUri}

                    </div>

                  </div>

                  <div>

                    <label className="text-xs text-text-secondary block mb-1.5 font-medium">Verification Code</label>

                    <input

                      type="text"

                      value={twoFaCode}

                      onChange={(e) => setTwoFaCode(e.target.value)}

                      placeholder="Enter 6-digit code"

                      maxLength={6}

                      className="skeu-input w-full text-text-primary rounded-xl py-3 px-4 text-sm"

                    />

                  </div>

                  <div className="flex gap-2">

                    <Button variant="ghost" size="sm" onClick={() => { setShowTwoFaSetup(false); setTwoFaCode(''); setTwoFaUri(''); }}>

                      Cancel

                    </Button>

                    <Button variant="primary" size="sm" onClick={handleVerify2Fa} loading={verifying2Fa}>

                      Verify & Enable

                    </Button>

                  </div>

                </div>

              ) : (

                <div className="flex items-center justify-between">

                  <span className="text-sm text-text-primary">

                    {profile?.two_factor_enabled ? '2FA is enabled' : '2FA is disabled'}

                  </span>

                  <Button

                    variant={profile?.two_factor_enabled ? 'danger' : 'primary'}

                    size="sm"

                    onClick={profile?.two_factor_enabled ? handleDisable2Fa : handleSetup2Fa}

                    loading={settingUp2Fa}

                  >

                    {profile?.two_factor_enabled ? 'Disable 2FA' : 'Enable 2FA'}

                  </Button>

                </div>

              )}

            </Card>

          </div>

        )}



        {tab === 'kyc' && (() => {

          const kycStatus = profile?.kyc_status ?? 'pending';

          const isVerified = kycStatus === 'verified' || kycStatus === 'approved';

          const isUnderReview = kycStatus === 'under_review';

          const isRejected = kycStatus === 'rejected';

          const canSubmit = !isVerified && !isUnderReview;

          const showForm = showKycForm || (canSubmit && kycDocs.length === 0);



          return (

            <div className="max-w-lg space-y-6">



              {/* Status banner */}

              <Card variant="glass" padding="lg">

                <div className="flex items-center justify-between mb-1">

                  <h3 className="text-md font-semibold text-text-primary">KYC Verification</h3>

                  <span className={clsx(

                    'inline-flex items-center px-2.5 py-1 text-[10px] font-semibold rounded-md uppercase tracking-wider',

                    kycStatusStyle(kycStatus),

                  )}>

                    {kycStatus.replace(/_/g, ' ')}

                  </span>

                </div>



                {isVerified && (

                  <p className="text-xs text-buy mt-2">✓ Your identity has been verified. You have full access to all platform features.</p>

                )}



                {isUnderReview && (

                  <p className="text-xs text-warning mt-2">Your documents are under review. We'll notify you within 1–2 business days.</p>

                )}



                {isRejected && (

                  <div className="mt-3 rounded-lg border border-sell/20 bg-sell/5 px-3 py-2">

                    <p className="text-xs font-semibold text-sell">Application Rejected</p>

                    {kycDocs.find(d => d.status === 'rejected')?.rejection_reason && (

                      <p className="text-xs text-sell/80 mt-0.5">

                        Reason: {kycDocs.find(d => d.status === 'rejected')?.rejection_reason}

                      </p>

                    )}

                    {!showForm && (

                      <button

                        onClick={() => setShowKycForm(true)}

                        className="mt-2 text-xs font-semibold text-white bg-sell/80 hover:bg-sell px-3 py-1.5 rounded-lg transition-all"

                      >

                        Reapply Now →

                      </button>

                    )}

                  </div>

                )}



                {kycDocs.length === 0 && !isVerified && !isUnderReview && (

                  <p className="text-xs text-text-tertiary mt-2">Please upload a government-issued ID to verify your account and unlock full trading features.</p>

                )}

              </Card>



              {/* Previous documents */}

              {kycDocs.length > 0 && (

                <Card variant="glass" padding="lg">

                  <h4 className="text-sm font-semibold text-text-primary mb-3">Submitted Documents</h4>

                  <div className="space-y-3">

                    {kycDocs.map((doc) => (

                      <div key={doc.id} className="glass-card rounded-lg p-3 flex items-start justify-between gap-3">

                        <div className="min-w-0">

                          <div className="text-sm font-medium text-text-primary capitalize">

                            {doc.document_type?.replace(/_/g, ' ')}

                          </div>

                          <div className="text-xs text-text-tertiary mt-0.5">

                            {new Date(doc.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}

                          </div>

                          {doc.status === 'rejected' && doc.rejection_reason && (

                            <div className="text-xs text-sell mt-1">↳ {doc.rejection_reason}</div>

                          )}

                        </div>

                        <span className={clsx(

                          'shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-md uppercase',

                          kycStatusStyle(doc.status),

                        )}>

                          {doc.status}

                        </span>

                      </div>

                    ))}

                  </div>

                </Card>

              )}



              {/* Upload form */}

              {showForm && (

                <Card variant="glass" padding="lg">

                  <h4 className="text-sm font-semibold text-text-primary mb-4">

                    {isRejected ? 'Resubmit Document' : 'Upload Identity Document'}

                  </h4>



                  <div className="space-y-4">

                    <div>

                      <label className="text-xs text-text-secondary block mb-1.5 font-medium">Document Type</label>

                      <select

                        value={kycDocType}

                        onChange={(e) => setKycDocType(e.target.value)}

                        className="skeu-input w-full text-text-primary rounded-xl py-3 px-4 text-sm"

                      >

                        <option value="passport">Passport</option>

                        <option value="national_id">National ID Card</option>

                        <option value="driving_license">Driving License</option>

                        <option value="proof_of_address">Proof of Address</option>

                        <option value="selfie">Selfie with ID</option>

                        <option value="bank_statement">Bank Statement</option>

                      </select>

                    </div>



                    <div>

                      <label className="text-xs text-text-secondary block mb-1.5 font-medium">File (JPG, PNG, PDF, WEBP — max 10 MB)</label>

                      <label className={clsx(

                        'flex flex-col items-center justify-center w-full py-8 rounded-xl border-2 border-dashed cursor-pointer transition-all',

                        kycFile ? 'border-buy/40 bg-buy/5' : 'border-border-glass hover:border-buy/30 hover:bg-buy/5',

                      )}>

                        <input

                          type="file"

                          accept=".jpg,.jpeg,.png,.pdf,.webp"

                          className="hidden"

                          onChange={(e) => setKycFile(e.target.files?.[0] ?? null)}

                        />

                        {kycFile ? (

                          <>

                            <div className="text-2xl mb-1">📄</div>

                            <div className="text-sm font-medium text-buy">{kycFile.name}</div>

                            <div className="text-xs text-text-tertiary mt-0.5">{(kycFile.size / 1024).toFixed(0)} KB</div>

                          </>

                        ) : (

                          <>

                            <div className="text-2xl mb-1">☁️</div>

                            <div className="text-sm text-text-secondary">Click to browse file</div>

                            <div className="text-xs text-text-tertiary mt-0.5">JPG, PNG, PDF, WEBP up to 10 MB</div>

                          </>

                        )}

                      </label>

                    </div>



                    <div className="flex gap-2">

                      {isRejected && (

                        <Button variant="ghost" size="sm" onClick={() => { setShowKycForm(false); setKycFile(null); }}>

                          Cancel

                        </Button>

                      )}

                      <Button

                        variant="primary"

                        onClick={handleSubmitKyc}

                        loading={kycSubmitting}

                        className="flex-1"

                      >

                        {kycSubmitting ? 'Uploading…' : 'Submit for Review'}

                      </Button>

                    </div>

                  </div>

                </Card>

              )}

            </div>

          );




        })()}



        {tab === 'notifications' && (

          <div className="max-w-lg space-y-3">

            {[

              { label: 'Trade Executed', desc: 'When a trade is placed or closed', key: 'trade_executed' },

              { label: 'Deposit Approved', desc: 'When a deposit is processed', key: 'deposit_approved' },

              { label: 'Margin Warning', desc: 'When margin level drops below threshold', key: 'margin_warning' },

              { label: 'Price Alerts', desc: 'Custom price level notifications', key: 'price_alerts' },

              { label: 'Copy Trading', desc: 'When a copied trader opens a position', key: 'copy_trading' },

              { label: 'Newsletter', desc: 'Weekly market analysis and updates', key: 'newsletter' },

            ].map((n) => (

              <Card key={n.key} variant="glass" padding="sm" className="flex items-center justify-between">

                <div className="px-1">

                  <div className="text-sm text-text-primary">{n.label}</div>

                  <div className="text-[10px] text-text-tertiary">{n.desc}</div>

                </div>

                <button

                  onClick={() => toggleNotifPref(n.key)}

                  className={clsx(

                    'relative w-9 h-5 rounded-full transition-all flex-shrink-0',

                    notifPrefs[n.key] ? 'bg-buy' : 'bg-bg-hover',

                  )}

                >

                  <div className={clsx(

                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',

                    notifPrefs[n.key] ? 'left-[18px]' : 'left-0.5',

                  )} />

                </button>

              </Card>

            ))}

          </div>

        )}



        {tab === 'sessions' && (

          <div className="max-w-2xl space-y-4">

            <Card variant="glass" padding="lg">

              <h3 className="text-md font-semibold text-text-primary mb-4">Active Sessions</h3>

              {sessions.length === 0 ? (

                <p className="text-sm text-text-tertiary text-center py-4">No active sessions</p>

              ) : (

                <div className="space-y-3">

                  {sessions.map((s) => (

                    <div key={s.id} className="glass-card rounded-lg p-4 flex items-center justify-between">

                      <div>

                        <div className="text-sm font-medium text-text-primary">

                          {s.device_info || s.user_agent || 'Unknown Device'}

                        </div>

                        <div className="text-xs text-text-tertiary mt-0.5">

                          IP: {s.ip_address} • {new Date(s.created_at).toLocaleString()}

                        </div>

                      </div>

                      <Button

                        variant="danger"

                        size="sm"

                        onClick={() => handleTerminateSession(s.id)}

                        loading={terminatingSession === s.id}

                      >

                        Terminate

                      </Button>

                    </div>

                  ))}

                </div>

              )}

            </Card>

          </div>

        )}

      </div>

    </div>

  );

}

