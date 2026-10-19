import styles from './Avatar.module.css';

interface AvatarProps {
  name: string;
  url: string | null;
  size?: number;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** The user's profile photo, or their initials when no photo has been added. */
export function Avatar({ name, url, size = 32 }: AvatarProps) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {url ? <img src={url} alt="" className={styles.image} /> : initials(name)}
    </span>
  );
}
