# Odenta Frontend - Quick Reference Guide

## Quick Start

```bash
cd dentalflow/frontend
npm install
npm run dev
# Open http://localhost:3000
```

## Key Files

| File | Purpose |
|------|---------|
| `lib/mock-data.ts` | All mock data (patients, appointments, invoices) |
| `lib/types.ts` | TypeScript type definitions |
| `lib/store.ts` | Zustand state management (auth) |
| `app/layout.tsx` | Root layout |
| `components/layout/app-layout.tsx` | Main navigation |
| `components/odontogram/tooth-chart.tsx` | Interactive tooth chart |

## Common Tasks

### Add New Patient
1. Go to `/patients`
2. Click "Add Patient"
3. Fill form → Submit
4. Patient added to `mockPatients` (in-memory)

### Create Appointment
1. Go to `/appointments`
2. Click time slot
3. Select patient, treatment type
4. Submit → Added to calendar

### Record Payment
1. Go to `/payments`
2. Find invoice → Click "Record Payment"
3. Enter amount → Submit
4. Invoice status updated

### Add Dentist (Admin)
1. Login to `/admin/login` (admin@odenta.uz / admin123)
2. Click "Create" button
3. Fill dentist details → Submit

## Routes Cheat Sheet

### Dentist Routes
- `/dashboard` - Main dashboard
- `/patients` - Patient list
- `/patients/[id]` - Patient detail + odontogram
- `/appointments` - Calendar (day/week views)
- `/payments` - Invoice tracking
- `/settings` - Dentist profile

### Admin Routes
- `/admin/login` - Admin login
- `/admin` - Admin dashboard
- `/admin/settings` - Admin profile

### Auth Routes
- `/` - Landing page
- `/login` - Dentist login (Google OAuth mock)
- `/register` - Dentist registration

## Component Library

### shadcn/ui Components
```bash
# Add new component
npx shadcn@latest add [component-name]

# Example: Add select component
npx shadcn@latest add select
```

### Custom Components
- `<ToothChart />` - 32-tooth interactive grid
- `<ToothDetailModal />` - Treatment history
- `<AppLayout />` - Main app wrapper

## Mock Data Structure

### Patients
```typescript
mockPatients: Patient[] // 15 sample patients
```

### Appointments
```typescript
mockAppointments: Appointment[] // 20+ appointments
```

### Invoices
```typescript
mockInvoices: Invoice[] // 12 invoices
mockPayments: Payment[] // Payment records
```

### Odontograms
```typescript
mockOdontograms: Record<string, ToothCondition[]>
// Key: patientId, Value: Array of 32 teeth
```

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port 3000
npx kill-port 3000
npm run dev
```

### Module Not Found
```bash
npm install
# or
rm -rf node_modules package-lock.json
npm install
```

### Build Errors
```bash
npm run build
# Check for TypeScript errors
```

## Deployment

### Vercel (Recommended)
```bash
vercel
```

### Build for Production
```bash
npm run build
npm start
```

## Environment Variables

Create `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_APP_NAME=Odenta
```

## Backup Location

**Frontend Backup:** `C:\Users\user\.gemini\antigravity\scratch\dentalflow-frontend-backup`

## Next Steps

1. ✅ Frontend complete (mock data)
2. ⏳ Backend integration (Laravel + PostgreSQL)
3. ⏳ Real authentication (Google OAuth)
4. ⏳ Multi-tenancy implementation
5. ⏳ Production deployment

---

**For detailed documentation, see:** `frontend_documentation.md`
