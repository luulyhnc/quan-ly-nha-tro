# Nha tro Manager

Static React/Vite dashboard quan ly nha tro, dang nhap bang Supabase Auth va deploy duoc len GitHub Pages. App khong dung Next.js server, khong co backend rieng, va chi can Supabase Free.

## Chuc nang

- Dang nhap / dang ky bang Supabase Auth email + password.
- Quan ly nha, phong, so nguoi o, gia dien/nuoc, tien phong va phi dich vu.
- Nhap chi so dien/nuoc tung phong theo thang.
- Nhap hoa don dien/nuoc nha nuoc theo tung nha.
- Tu tinh tong thu, tong chi, chenh lech, chenh lech tren moi nguoi.
- Canh bao bat thuong: am chi so, phong trong van co su dung, thieu hoa don, lech san luong voi hoa don nha nuoc, bien dong cao so voi thang truoc.
- Co demo data khi chua cau hinh Supabase de xem giao dien local.

## Cai dat local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Trong PowerShell tren Windows neu `npm.ps1` bi chan, dung:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' install
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

## Supabase Free setup

1. Tao project moi tren Supabase Free.
2. Vao SQL Editor, chay file `supabase/schema.sql`.
3. Vao Authentication > Providers, bat Email provider.
4. Lay Project URL va anon public key, dien vao `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Tat ca bang deu bat Row Level Security. Du lieu moi gan voi `auth.uid()` cua user dang nhap.

## Deploy GitHub Pages

1. Push repo len GitHub branch `main`.
2. Vao repository Settings > Secrets and variables > Actions, them:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Vao Settings > Pages, chon Source la GitHub Actions.
4. Workflow `.github/workflows/deploy.yml` se build static `dist` va deploy len Pages.

Neu dung custom domain hoac base path rieng, them secret/env `VITE_BASE_PATH`.
