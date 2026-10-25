import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function shareEncryptedBackup(encrypted) {
  // The Android WebView cannot reliably download a Blob. Share an encrypted
  // file from app cache through Android's file provider instead.
  const { uri } = await Filesystem.writeFile({
    path: 'lax-backups/project-lax-backup.json',
    data: encrypted,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  await Share.share({
    title: 'Project LAX encrypted backup',
    url: uri,
    dialogTitle: 'Save encrypted backup',
  });
}
