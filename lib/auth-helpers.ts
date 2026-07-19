// Supabase Auth butuh format email. Karena registrasi hanya pakai
// username + password + no. HP (tanpa email), kita buat email internal
// deterministik dari username. Ini tidak pernah ditampilkan ke user.
export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@users.kerjahub.internal`;
}

export function isValidUsername(username: string) {
  return /^[a-zA-Z0-9_.]{4,20}$/.test(username);
}

export function isValidPhone(phone: string) {
  return /^0[0-9]{9,13}$/.test(phone.trim());
}
