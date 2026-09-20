"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
const khmer: Record<string, string> = {
  "Pre-order": "បញ្ជាទិញជាមុន",
  "Pre-order first": "បញ្ជាទិញជាមុននៅខាងដើម",
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
  "Add to cart": "\u1794\u1793\u17d2\u1790\u17c2\u1798\u1780\u17d2\u1793\u17bb\u1784\u1780\u1793\u17d2\u179a\u17d2\u178f\u1780", "Quick view": "\u1798\u17be\u179b\u179a\u17a0\u17d0\u179f",
  "Home":"ទំព័រដើម", "All products":"ផលិតផលទាំងអស់", "New arrivals":"ទំនិញមកដល់ថ្មី", "Social":"បណ្ដាញសង្គម", "View Our Location":"មើលទីតាំងហាង", "Shop New Arrivals":"ទិញទំនិញថ្មី", "Browse Collection":"មើលផលិតផល", "Contact Us":"ទាក់ទងយើង", "New arrival":"ទំនិញថ្មី", "Bestseller":"លក់ដាច់បំផុត", "Fashion":"ម៉ូដសម្លៀកបំពាក់", "Search products":"ស្វែងរកផលិតផល", "Search for products, categories, or styles…":"ស្វែងរកផលិតផល ប្រភេទ ឬម៉ូដ…", "Sort by":"តម្រៀបតាម", "Featured":"ផលិតផលពិសេស", "Price: low to high":"តម្លៃ៖ ទាបទៅខ្ពស់", "Price: high to low":"តម្លៃ៖ ខ្ពស់ទៅទាប", "Name: A–Z":"ឈ្មោះ៖ A–Z", "Filter":"តម្រង", "In stock only":"មានស្តុកប៉ុណ្ណោះ", "Minimum price":"តម្លៃអប្បបរមា", "Maximum price":"តម្លៃអតិបរមា", "Any price":"គ្រប់តម្លៃ", "Reset filters":"កំណត់តម្រងឡើងវិញ", "Other":"ផ្សេងៗ", "products":"ផលិតផល", "product":"ផលិតផល", "No matching products":"រកមិនឃើញផលិតផល", "Our collection is coming soon":"ផលិតផលនឹងមកដល់ឆាប់ៗ", "Try another search, category, or price range.":"សូមស្វែងរក ឬជ្រើសប្រភេទ និងតម្លៃផ្សេង។", "Check back soon for the latest arrivals.":"សូមត្រឡប់មកវិញសម្រាប់ទំនិញថ្មី។", "Clear filters":"លុបតម្រង", "Load more products":"មើលផលិតផលបន្ថែម", "Sold out":"អស់ស្តុក", "In stock":"មានស្តុក", "Only":"នៅសល់", "left":"ប៉ុណ្ណោះ", "Size":"ទំហំ", "Colour":"ពណ៌", "Selected":"បានជ្រើសរើស", "Variant":"ជម្រើសផលិតផល", "Quantity":"ចំនួន", "Order":"បញ្ជាទិញ", "Ordering paused":"ផ្អាកការបញ្ជាទិញ", "Ready to order":"អាចបញ្ជាទិញបាន", "Customize your selection":"ជ្រើសរើសតាមតម្រូវការ", "Collection":"បណ្ដុំផលិតផល", "from":"ចាប់ពី", "Opening hours":"ម៉ោងបើកហាង", "Closed":"បិទ", "Find your favorites in our online collection.":"ស្វែងរកផលិតផលដែលអ្នកពេញចិត្តក្នុងហាងអនឡាញរបស់យើង។", "Your Order":"ការបញ្ជាទិញរបស់អ្នក", "Review your items, choose delivery or pickup, and place your order.":"ពិនិត្យទំនិញ ជ្រើសការដឹកជញ្ជូន ឬមកយក ហើយបញ្ជាទិញ។", "Subtotal":"សរុបរង", "Total":"សរុប", "Coupon code":"លេខកូដបញ្ចុះតម្លៃ", "Enter code":"បញ្ចូលលេខកូដ", "Apply":"ប្រើប្រាស់", "Fulfillment":"វិធីទទួលទំនិញ", "Pickup":"មកយកនៅហាង", "Delivery":"ដឹកជញ្ជូន", "Dine In":"ញ៉ាំនៅហាង", "Delivery zone":"តំបន់ដឹកជញ្ជូន", "Order time":"ពេលបញ្ជាទិញ", "As soon as possible":"ឆាប់បំផុត", "Schedule":"កំណត់ពេល", "Payment":"ការទូទាត់", "Pay Later / Cash":"បង់ប្រាក់ពេលទទួល / សាច់ប្រាក់", "Payment reference":"លេខយោងការទូទាត់", "Name":"ឈ្មោះ", "Your name":"ឈ្មោះរបស់អ្នក", "Phone":"ទូរស័ព្ទ", "Phone number":"លេខទូរស័ព្ទ", "Delivery address":"អាសយដ្ឋានដឹកជញ្ជូន", "Street, house, area":"ផ្លូវ ផ្ទះ តំបន់", "Note":"កំណត់ចំណាំ", "Optional note for the shop":"កំណត់ចំណាំសម្រាប់ហាង", "Place Order":"បញ្ជាទិញ", "Sending Order...":"កំពុងផ្ញើការបញ្ជាទិញ...", "Add to Order":"បន្ថែមក្នុងការបញ្ជាទិញ", "Close cart":"បិទការបញ្ជាទិញ", "Close":"បិទ", "each":"ក្នុងមួយ", "item":"មុខ", "items":"មុខ"
};
const LanguageContext = createContext({ language: "en", setLanguage: (_value: string) => { void _value; }, t: (text: string) => text });
export function StorefrontLanguage({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState("en");
  useEffect(() => { const frame = requestAnimationFrame(() => { try { if (localStorage.getItem("storefront-language") === "km") setLanguage("km"); } catch {} }); return () => cancelAnimationFrame(frame); }, []);
  function change(value: string) { const next = value === "km" ? "km" : "en"; setLanguage(next); try { localStorage.setItem("storefront-language", next); } catch {} }
  return <LanguageContext.Provider value={{ language, setLanguage: change, t: text => language === "km" ? khmer[text] ?? text : text }}><div lang={language}>{children}</div></LanguageContext.Provider>;
}
export const useStorefrontLanguage = () => useContext(LanguageContext);
