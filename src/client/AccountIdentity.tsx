import { useEffect, useState } from 'react';
import { gravatarUrl } from './gravatar';
import './account-identity.css';

export interface AccountIdentityProps {
  email: string;
  callsign?: string;
  displayName?: string;
  useGravatar?: boolean;
  className?: string;
}

/** Content for an account button. The parent supplies its action and accessible name. */
export function AccountIdentity({
  email,
  callsign,
  displayName,
  useGravatar = false,
  className = '',
}: AccountIdentityProps) {
  const [avatar, setAvatar] = useState<{ email: string; url: string } | null>(null);
  const [loadedUrl, setLoadedUrl] = useState('');
  const [failedUrl, setFailedUrl] = useState('');

  useEffect(() => {
    let active = true;
    setAvatar(null);
    setLoadedUrl('');
    setFailedUrl('');
    if (useGravatar) {
      void gravatarUrl(email)
        .then((url) => {
          if (active && url) setAvatar({ email, url });
        })
        .catch(() => {
          // Keep the readable local identity if Web Crypto is unavailable.
        });
    }
    return () => {
      active = false;
    };
  }, [email, useGravatar]);

  // Guard rendering as well as the effect: opting out or changing accounts must
  // immediately stop rendering the prior account's externally loaded avatar.
  const url = useGravatar && avatar?.email === email ? avatar.url : null;
  const label = callsign?.trim().toUpperCase() || 'Me';

  return (
    <span
      className={`account-identity ${className}`.trim()}
      title={displayName?.trim() || undefined}
    >
      {url && url !== failedUrl && (
        <img
          className="account-identity-image"
          src={url}
          alt=""
          width={32}
          height={32}
          hidden={loadedUrl !== url}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          decoding="async"
          onLoad={() => setLoadedUrl(url)}
          onError={() => setFailedUrl(url)}
        />
      )}
      <span className="account-identity-label">{label}</span>
    </span>
  );
}
