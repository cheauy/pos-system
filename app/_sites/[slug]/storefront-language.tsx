"use client";
import { translateUiText } from "@/lib/i18n/translations";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
const khmer: Record<string, string> = {
  "monday": "ថ្ងៃចន្ទ", "tuesday": "ថ្ងៃអង្គារ", "wednesday": "ថ្ងៃពុធ",
  "thursday": "ថ្ងៃព្រហស្បតិ៍", "friday": "ថ្ងៃសុក្រ", "saturday": "ថ្ងៃសៅរ៍", "sunday": "ថ្ងៃអាទិត្យ",
  "Mon - Sun": "ចន្ទ - អាទិត្យ", "(+1 day)": "(ថ្ងៃបន្ទាប់)",
  "Browse online or get in touch using our contact details.": "មើលផលិតផលអនឡាញ ឬទាក់ទងយើងតាមព័ត៌មានទំនាក់ទំនងរបស់យើង។",
  "Pre-order": "បញ្ជាទិញជាមុន",
  "Pre-order first": "បង្ហាញការបញ្ជាទិញជាមុនមុនគេ",
  "Email": "អ៊ីមែល",
  "Tracking ID or link": "លេខសម្គាល់ ឬតំណតាមដាន",
  "Enter a valid tracking ID or link.": "សូមបញ្ចូលលេខសម្គាល់ ឬតំណតាមដានត្រឹមត្រូវ។",
  "Order not found. Check your tracking ID and try again.": "រកមិនឃើញការបញ្ជាទិញ។ សូមពិនិត្យលេខសម្គាល់ ហើយព្យាយាមម្ដងទៀត។",
  "Cash on Delivery (COD)": "បង់ប្រាក់ពេលទទួលទំនិញ (COD)",
  "Track My Order": "តាមដានការបញ្ជាទិញ",
  "View full screen": "មើលពេញអេក្រង់",
  "View KHQR": "មើល KHQR",
  "Save KHQR": "រក្សាទុក KHQR",
  "Open image to save": "បើករូបភាពដើម្បីរក្សាទុក",
  "Recent orders are saved on this device. Keep your tracking link to use another device.": "ការបញ្ជាទិញថ្មីៗត្រូវបានរក្សាទុកនៅលើឧបករណ៍នេះ។ សូមរក្សាតំណតាមដានដើម្បីប្រើលើឧបករណ៍ផ្សេង។",
  "No saved orders on this device yet.": "មិនទាន់មានការបញ្ជាទិញដែលបានរក្សាទុកនៅលើឧបករណ៍នេះទេ។",
  "Tracking link or tracking code": "តំណ ឬលេខកូដតាមដាន",
  "Enter a valid tracking link or code.": "សូមបញ្ចូលតំណ ឬលេខកូដតាមដានត្រឹមត្រូវ។",
  "Payment proof": "ភស្តុតាងបង់ប្រាក់", "Pickup Store": "មកយកនៅហាង",
  "Photos": "រូបភាព", "Photo": "រូបភាព", "Product photos": "រូបភាពផលិតផល", "Previous photo": "រូបភាពមុន", "Next photo": "រូបភាពបន្ទាប់", "Choose photo": "ជ្រើសរើសរូបភាព",
  "Add to cart": "បន្ថែមទៅកន្ត្រក", "Quick view": "\u1798\u17be\u179b\u179a\u17a0\u17d0\u179f",
  "Home":"ទំព័រដើម", "All products":"ផលិតផលទាំងអស់", "New arrivals":"ទំនិញមកដល់ថ្មី", "Social":"បណ្ដាញសង្គម", "View Our Location":"មើលទីតាំងហាង", "Shop New Arrivals":"ទិញទំនិញថ្មី", "Browse Collection":"មើលផលិតផល", "Contact Us":"ទាក់ទងយើង", "New arrival":"ទំនិញថ្មី", "Bestseller":"លក់ដាច់បំផុត", "Fashion":"ម៉ូដសម្លៀកបំពាក់", "Search products":"ស្វែងរកផលិតផល", "Search for products, categories, or styles…":"ស្វែងរកផលិតផល ប្រភេទ ឬម៉ូដ…", "Sort by":"តម្រៀបតាម", "Featured":"ផលិតផលពិសេស", "Price: low to high":"តម្លៃ៖ ទាបទៅខ្ពស់", "Price: high to low":"តម្លៃ៖ ខ្ពស់ទៅទាប", "Name: A–Z":"ឈ្មោះ៖ A–Z", "Filter":"តម្រង", "In stock only":"មានស្តុកប៉ុណ្ណោះ", "Minimum price":"តម្លៃអប្បបរមា", "Maximum price":"តម្លៃអតិបរមា", "Any price":"គ្រប់តម្លៃ", "Reset filters":"កំណត់តម្រងឡើងវិញ", "Other":"ផ្សេងៗ", "products":"ផលិតផល", "product":"ផលិតផល", "No matching products":"រកមិនឃើញផលិតផល", "Our collection is coming soon":"ផលិតផលនឹងមកដល់ឆាប់ៗ", "Try another search, category, or price range.":"សូមស្វែងរក ឬជ្រើសប្រភេទ និងតម្លៃផ្សេង។", "Check back soon for the latest arrivals.":"សូមត្រឡប់មកវិញសម្រាប់ទំនិញថ្មី។", "Clear filters":"លុបតម្រង", "Load more products":"មើលផលិតផលបន្ថែម", "Sold out":"អស់ស្តុក", "In stock":"មានស្តុក", "Only":"នៅសល់", "left":"ប៉ុណ្ណោះ", "Size":"ទំហំ", "Colour":"ពណ៌", "Selected":"បានជ្រើសរើស", "Variant":"ជម្រើសផលិតផល", "Quantity":"ចំនួន", "Order": "ការបញ្ជាទិញ", "Ordering paused":"ផ្អាកការបញ្ជាទិញ", "Ready to order":"អាចបញ្ជាទិញបាន", "Customize your selection":"ជ្រើសរើសតាមតម្រូវការ", "Collection":"បណ្ដុំផលិតផល", "from":"ចាប់ពី", "Opening hours":"ម៉ោងបើកហាង", "Closed":"បិទ", "Find your favorites in our online collection.":"ស្វែងរកផលិតផលដែលអ្នកពេញចិត្តក្នុងហាងអនឡាញរបស់យើង។", "Your Order":"ការបញ្ជាទិញរបស់អ្នក", "Review your items, choose delivery or pickup, and place your order.":"ពិនិត្យទំនិញ ជ្រើសការដឹកជញ្ជូន ឬមកយក ហើយបញ្ជាទិញ។", "Subtotal": "សរុបរង", "Total":"សរុប", "Coupon code":"លេខកូដបញ្ចុះតម្លៃ", "Enter code":"បញ្ចូលលេខកូដ", "Apply": "អនុវត្ត", "Fulfillment":"វិធីទទួលទំនិញ", "Pickup":"មកយកនៅហាង", "Delivery":"ដឹកជញ្ជូន", "Dine In":"ញ៉ាំនៅហាង", "Delivery zone":"តំបន់ដឹកជញ្ជូន", "Order time":"ពេលបញ្ជាទិញ", "As soon as possible":"ឆាប់បំផុត", "Schedule":"កំណត់ពេល", "Payment":"ការទូទាត់", "Pay Later / Cash": "បង់ពេលក្រោយ / សាច់ប្រាក់", "Payment reference":"លេខយោងការទូទាត់", "Name":"ឈ្មោះ", "Your name":"ឈ្មោះរបស់អ្នក", "Phone":"ទូរស័ព្ទ", "Phone number":"លេខទូរស័ព្ទ", "Delivery address":"អាសយដ្ឋានដឹកជញ្ជូន", "Street, house, area":"ផ្លូវ ផ្ទះ តំបន់", "Note":"កំណត់ចំណាំ", "Optional note for the shop": "កំណត់ចំណាំសម្រាប់ហាង (មិនចាំបាច់)", "Place Order":"បញ្ជាទិញ", "Sending Order...":"កំពុងផ្ញើការបញ្ជាទិញ...", "Add to Order": "បន្ថែមទៅការបញ្ជាទិញ", "Close cart": "បិទកន្ត្រក", "Close":"បិទ", "each": "ក្នុងមួយមុខ", "item":"មុខ", "items":"មុខ",
  "Add cart": "បន្ថែមទៅកន្ត្រក",
  "Added to cart": "បានបន្ថែមទៅកន្ត្រក",
  "No image": "គ្មានរូបភាព",
  "Image unavailable": "មិនអាចបង្ហាញរូបភាពបាន",
  "Shop products": "ទិញផលិតផល",
  "Sort products": "តម្រៀបផលិតផល",
  "Product layout": "របៀបបង្ហាញផលិតផល",
  "Grid view": "ទិដ្ឋភាពក្រឡា",
  "List view": "ទិដ្ឋភាពបញ្ជី",
  "Product categories": "ប្រភេទផលិតផល",
  "Browse our collection. Online ordering is currently paused.": "មើលផលិតផលរបស់យើង។ ការបញ្ជាទិញអនឡាញកំពុងផ្អាក។",
  "Store social links": "តំណបណ្ដាញសង្គមរបស់ហាង",
  "Powered by Tenh POS": "ដំណើរការដោយ Tenh POS",
  "Store language": "ភាសារបស់ហាង",
  "Store navigation": "ម៉ឺនុយហាង",
  "Open cart": "បើកកន្ត្រក",
  "logo": "និមិត្តសញ្ញា",
  "Store KHQR": "KHQR របស់ហាង",
  "Stylish essentials for your everyday story.\nFind your next favorite, made for your style.": "សម្លៀកបំពាក់ទាន់សម័យសម្រាប់ជីវិតប្រចាំថ្ងៃរបស់អ្នក។\nស្វែងរកសម្លៀកបំពាក់ថ្មីដែលអ្នកពេញចិត្ត និងស័ក្តិសមនឹងម៉ូដរបស់អ្នក។",
  "Explore our collection and find your next favorite.": "មើលផលិតផលរបស់យើង និងស្វែងរកផលិតផលថ្មីដែលអ្នកពេញចិត្ត។",
  "Good Clothes.": "សម្លៀកបំពាក់ល្អ។",
  "Brighter Days.": "ថ្ងៃថ្មីកាន់តែស្រស់ស្រាយ។",
  "FASHION": "ម៉ូដ",
  "LIVES HERE": "នៅទីនេះ",
  "This product is no longer available.": "ផលិតផលនេះលែងមានទៀតហើយ។",
  "Contact store on Telegram": "ទាក់ទងហាងតាម Telegram",
  "Chat with us": "ជជែកជាមួយយើង",
  "Choose colour and size. Stock is checked for the exact pair.": "ជ្រើសរើសពណ៌ និងទំហំ។ ស្តុកត្រូវបានពិនិត្យតាមពណ៌ និងទំហំដែលបានជ្រើសរើស។",
  "Build your drink — choose size, sweetness, ice, milk and toppings.": "រៀបចំភេសជ្ជៈតាមចំណូលចិត្ត ដោយជ្រើសរើសទំហំ កម្រិតផ្អែម ទឹកកក ទឹកដោះគោ និងគ្រឿងបន្ថែម។",
  "Choose options before adding to cart.": "ជ្រើសរើសជម្រើសមុនពេលបន្ថែមទៅកន្ត្រក។",
  "Choose": "ជ្រើសរើស",
  "Option": "ជម្រើស",
  "available to add": "អាចបន្ថែមបាន",
  "stock": "មានក្នុងស្តុក",
  "Choose one": "ជ្រើសរើសមួយ",
  "Choose up to": "ជ្រើសរើសបានរហូតដល់",
  "Included": "រួមបញ្ចូលរួច",
  "Cart changed. Apply your coupon again.": "កន្ត្រកបានផ្លាស់ប្ដូរ។ សូមអនុវត្តលេខកូដបញ្ចុះតម្លៃម្ដងទៀត។",
  "Coupon is not available.": "លេខកូដបញ្ចុះតម្លៃមិនអាចប្រើបានទេ។",
  "Coupon": "លេខកូដបញ្ចុះតម្លៃ",
  "applied · save": "បានអនុវត្ត · សន្សំបាន",
  "Please select a delivery zone.": "សូមជ្រើសរើសតំបន់ដឹកជញ្ជូន។",
  "This store has no online payment method enabled.": "ហាងនេះមិនទាន់បើកវិធីទូទាត់អនឡាញទេ។",
  "Please choose the requested order time.": "សូមជ្រើសរើសពេលទទួលការបញ្ជាទិញដែលអ្នកចង់បាន។",
  "Upload payment proof to continue.": "សូមបញ្ចូលភស្តុតាងបង់ប្រាក់ដើម្បីបន្ត។",
  "Payment proof must be a JPG, PNG or WebP image up to 5 MB.": "ភស្តុតាងបង់ប្រាក់ត្រូវជារូបភាព JPG, PNG ឬ WebP ដែលមានទំហំមិនលើស 5 MB។",
  "Unable to place order.": "មិនអាចបញ្ជាទិញបានទេ។",
  "created": "បានបង្កើត",
  "was sent successfully.": "បានផ្ញើដោយជោគជ័យ។",
  "Remove from order": "ដកចេញពីការបញ្ជាទិញ",
  "Decrease quantity": "បន្ថយចំនួន",
  "Increase quantity": "បង្កើនចំនួន",
  "Checking discount for your current cart…": "កំពុងពិនិត្យការបញ្ចុះតម្លៃសម្រាប់កន្ត្រកបច្ចុប្បន្នរបស់អ្នក…",
  "Loyalty is enabled. This order can earn points after the shop marks it completed.": "កម្មវិធីពិន្ទុអតិថិជនបានបើក។ ការបញ្ជាទិញនេះអាចទទួលបានពិន្ទុ បន្ទាប់ពីហាងកំណត់ថាបានបញ្ចប់។",
  "Minimum order is": "តម្លៃបញ្ជាទិញអប្បបរមាគឺ",
  "for": "សម្រាប់",
  "Zone minimum:": "តម្លៃអប្បបរមាសម្រាប់តំបន់៖",
  "Pay exactly": "សូមបង់ប្រាក់ឱ្យត្រូវតាមចំនួន",
  "JPG, PNG or WebP, up to 5 MB. Required for KHQR payment.": "JPG, PNG ឬ WebP ដែលមានទំហំមិនលើស 5 MB។ ត្រូវការសម្រាប់ការទូទាត់តាម KHQR។",
  "The shop will verify the KHQR payment before marking it paid.": "ហាងនឹងផ្ទៀងផ្ទាត់ការទូទាត់តាម KHQR មុនពេលកំណត់ថាបានបង់ប្រាក់។",
  "We couldn’t load this store": "មិនអាចផ្ទុកហាងនេះបានទេ",
  "Please try again in a moment.": "សូមព្យាយាមម្ដងទៀតបន្តិចទៀត។",
  "Loading store": "កំពុងផ្ទុកហាង",
  "Loading products…": "កំពុងផ្ទុកផលិតផល…",
  "Store unavailable": "ហាងមិនអាចបើកបាន",
  "Store temporarily unavailable": "ហាងមិនអាចបើកបានបណ្ដោះអាសន្ន",
};
type StorefrontLanguageCode = "en" | "km";
type LanguageContextValue = {
  language: StorefrontLanguageCode;
  setLanguage: (value: string) => void;
  t: (text: string) => string;
};
const LanguageContext = createContext<LanguageContextValue>({ language: "en", setLanguage: () => {}, t: text => text });

export function StorefrontLanguage({ children, storeId, initialLanguage = "en" }: {
  children: ReactNode;
  storeId: string;
  initialLanguage?: string;
}) {
  const defaultLanguage: StorefrontLanguageCode = initialLanguage === "km" ? "km" : "en";
  const [language, setLanguage] = useState<StorefrontLanguageCode>(defaultLanguage);
  const preferenceKey = `tenh-storefront-language:${storeId}`;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let next = defaultLanguage;
      try {
        const stored = localStorage.getItem(preferenceKey);
        const preference = stored ? JSON.parse(stored) : null;
        // A seller's new default takes effect on the next visit. A customer's
        // explicit override is otherwise remembered for this store only.
        if (preference?.defaultLanguage === defaultLanguage &&
            (preference.language === "en" || preference.language === "km")) {
          next = preference.language;
        }
      } catch { /* The store default works even when browser storage is unavailable. */ }
      setLanguage(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [defaultLanguage, preferenceKey]);

  function change(value: string) {
    const next = value === "km" ? "km" : "en";
    setLanguage(next);
    try { localStorage.setItem(preferenceKey, JSON.stringify({ language: next, defaultLanguage })); }
    catch { /* The visitor can still change language for the current visit. */ }
  }

  return <LanguageContext.Provider value={{ language, setLanguage: change, t: text => language === "km" ? khmer[text] ?? translateUiText(text, language) : text }}>
    {/* Do not let the dashboard's shared language cookie translate this store. */}
    <div lang={language} data-storefront-language="true" data-i18n-ignore="true">{children}</div>
  </LanguageContext.Provider>;
}
export const useStorefrontLanguage = () => useContext(LanguageContext);
