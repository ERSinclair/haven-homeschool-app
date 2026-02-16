# Haven Design System

## 🎯 **Standard Layout Structure**

All main pages in Haven must follow this exact layout structure. **Do not modify unless explicitly requested.**

### **Header Component**
```jsx
import HavenHeader from '@/components/HavenHeader';

// Use this standardized header on all main pages:
<HavenHeader />
```

### **Standard Page Structure**
```jsx
export default function YourPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Always use the HavenHeader component */}
        <HavenHeader />

        {/* Controls/Navigation - always with mb-4 */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide justify-center">
          {/* Button controls here */}
        </div>

        {/* Content with proper spacing - always add mt-6 for avatar sections */}
        <div className="space-y-4 mt-6">
          {/* Content with avatars here */}
        </div>
      </div>
    </div>
  );
}
```

## 🖼️ **Avatar Standards**

### **Avatar Component Usage**
All avatars MUST include `showFamilySilhouette={true}` for consistency:

```jsx
<AvatarUpload
  userId={user.id}
  currentAvatarUrl={user.avatar_url}
  name={user.name}
  size="md"
  editable={false}
  showFamilySilhouette={true}  // ← REQUIRED on all avatars
/>
```

### **Avatar Sizes**
- `sm`: 32px (8x8) - For compact lists, chat headers
- `md`: 48px (12x12) - For main lists, cards 
- `lg`: 64px (16x16) - For profile modals, details
- `xl`: 96px (24x24) - For main profile display

## 📐 **Spacing Standards**

### **Header to Controls Spacing**
- Header: `HavenHeader` component (includes `mb-8 mt-8` and `mb-24`)
- Controls: Always `mb-4`
- Content with avatars: Always `mt-6` (creates proper spacing between controls and avatars)

### **Critical Spacing Rule**
When content contains avatars, always add `mt-6` to the container:
```jsx
// ✅ CORRECT - Proper spacing between controls and avatars
<div className="space-y-4 mt-6">
  {items.map(item => (
    <div key={item.id}>
      <AvatarUpload ... />
    </div>
  ))}
</div>

// ❌ WRONG - Too tight spacing
<div className="space-y-4">
  {items.map(item => (
    <div key={item.id}>
      <AvatarUpload ... />
    </div>
  ))}
</div>
```

## 🎨 **Haven Branding**

### **Logo/Title**
Always use the exact styling:
```jsx
<span className="font-bold text-emerald-600 text-4xl cursor-pointer hover:text-emerald-700 transition-colors" 
      style={{ fontFamily: 'var(--font-fredoka)' }}>
  Haven
</span>
```

### **Color Scheme**
- Primary: `emerald-600` / `teal-600`
- Background gradient: `from-emerald-50 to-white`
- Text: `gray-900` (primary), `gray-600` (secondary), `gray-500` (tertiary)
- Borders: `gray-200` for subtle, `teal-200` for active states

## 📱 **Button Standards**

### **Control Buttons**
```jsx
<button
  className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-white text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-200 hover:border-teal-200 hover:shadow-md hover:scale-105"
>
  Button Text
</button>
```

### **Active State**
```jsx
<button
  className="px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm min-w-fit flex items-center justify-center bg-teal-600 text-white shadow-md scale-105"
>
  Active Button
</button>
```

## 🔄 **Implementation Checklist**

When creating new pages:
- [ ] Import and use `HavenHeader` component
- [ ] Follow standard page structure
- [ ] Add `showFamilySilhouette={true}` to all avatars
- [ ] Use proper spacing (`mt-6` for avatar content)
- [ ] Apply standard button styling
- [ ] Test avatar positioning matches other pages

## 🚫 **Do Not Modify Unless Explicitly Asked**

This design system is the Haven standard. Changes should only be made when specifically requested to ensure consistency across the entire app.