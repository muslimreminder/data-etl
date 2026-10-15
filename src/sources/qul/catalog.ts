import type { LanguageCode } from '@muslimreminder/schema/common';
import type { QuranTranslationId } from '@muslimreminder/schema/content';

/** A translation hand-picked from https://qul.tarteel.ai/resources/translation. */
export type QulTranslation = {
    id: QuranTranslationId;
    /** Id of the resource on QUL (`/resources/translation/{qulId}`). */
    qulId: number;
    language: LanguageCode;
    name: string;
    /** Download to pick on QUL: `translation-with-footnote-tags.json` when it exists, else `simple.json`. */
    format: 'footnote-tags' | 'simple';
    /** Recognizes the downloaded file, whatever QUL or the browser named it. */
    file: RegExp;
    license?: string;
};

/**
 * Published translations, in catalog order. To add one: append it here, download it from QUL
 * (an account is required), then `npm run upload-qul -- <file>` and run "Publish content".
 */
export const QUL_TRANSLATIONS: QulTranslation[] = [
    { id: 'fr-hamidullah', qulId: 227, language: 'fr', name: 'Muhammad Hamidullah', format: 'footnote-tags', file: /hamidullah/i },
    { id: 'fr-rashid-maash', qulId: 295, language: 'fr', name: 'Rashid Maash', format: 'footnote-tags', file: /rashid-maash/i },
    { id: 'fr-montada', qulId: 174, language: 'fr', name: 'Montada Islamic Foundation', format: 'footnote-tags', file: /montada/i },
    { id: 'en-daryabadi', qulId: 276, language: 'en', name: 'Abdul Majid Daryabadi', format: 'simple', file: /daryabadi/i },
    { id: 'tr-dar-al-salam', qulId: 196, language: 'tr', name: 'Dar Al-Salam Center', format: 'simple', file: /dar-al-salam/i },
    { id: 'tr-muslim-shahin', qulId: 157, language: 'tr', name: 'Muslim Shahin', format: 'simple', file: /muslim-shahin/i },
    { id: 'tr-shaban-britch', qulId: 161, language: 'tr', name: 'Shaban Britch', format: 'simple', file: /shaban-britch/i },
    { id: 'tr-hamdi', qulId: 233, language: 'tr', name: 'Elmalılı Hamdi Yazır', format: 'simple', file: /hamdi/i },
    { id: 'de-bubenheim', qulId: 191, language: 'de', name: 'Frank Bubenheim & Nadeem Elyas', format: 'simple', file: /bubenheim/i },
    { id: 'es-isa-garcia', qulId: 152, language: 'es', name: 'Isa Garcia', format: 'footnote-tags', file: /isa-garcia/i },
    // Same QUL file name as the French one: pass it explicitly, `npm run upload-qul -- es-montada=<file>`.
    { id: 'es-montada', qulId: 176, language: 'es', name: 'Montada Islamic Foundation', format: 'footnote-tags', file: /montada/i },
    { id: 'es-noor-international', qulId: 223, language: 'es', name: 'Noor International Center', format: 'footnote-tags', file: /noor-international/i },
    { id: 'ru-kuliev', qulId: 136, language: 'ru', name: 'Elmir Kuliev', format: 'simple', file: /kuliev/i },
    { id: 'ru-abu-adel', qulId: 150, language: 'ru', name: 'Abu Adel', format: 'simple', file: /abu-adel/i },
    { id: 'ru-sablukov', qulId: 274, language: 'ru', name: 'Gordy Semyonovich Sablukov', format: 'simple', file: /gordy|sablukov/i },
    { id: 'ru-osmanov', qulId: 271, language: 'ru', name: 'Magomed-Nuri Osmanov', format: 'simple', file: /nuri|osmanov/i },
    // Free to republish: QuranEnc.com translations (unchanged text, attribution, version; quranenc.com/en/browse)
    // and Pickthall (public domain). Some QUL file names are shared ("dar-al-salam-center"): upload those with an
    // explicit id. Left out: Waleed Bleyhesh (451), German and Korean Rowwad (467, 430), whose QUL files are
    // incomplete, and Bengali Rowwad (589), not downloadable.
    { id: 'en-saheeh-international', qulId: 193, language: 'en', name: 'Saheeh International', format: 'footnote-tags', file: /^en-sahih-international-(?:simple|with-footnote-tags)/i },
    { id: 'en-rowwad', qulId: 195, language: 'en', name: 'Rowwad Translation Center', format: 'simple', file: /^ruwwad-center-(?:simple|with-footnote-tags)/i },
    { id: 'en-hilali-khan', qulId: 121, language: 'en', name: 'Muhammad Taqi-ud-Din al-Hilali & Muhammad Muhsin Khan', format: 'simple', file: /^en-muhsin-khan-(?:simple|with-footnote-tags)/i },
    { id: 'en-pickthall', qulId: 145, language: 'en', name: 'Marmaduke Pickthall', format: 'simple', file: /^quran-en-pickthall-(?:simple|with-footnote-tags)/i },
    { id: 'de-abu-rida', qulId: 197, language: 'de', name: 'Abu Rida Muhammad ibn Ahmad', format: 'simple', file: /^abu-reda-muhammad-ibn-ahmad-(?:simple|with-footnote-tags)/i },
    { id: 'id-kemenag', qulId: 224, language: 'id', name: 'Kementerian Agama RI', format: 'footnote-tags', file: /^quran-id-(?:simple|with-footnote-tags)/i },
    { id: 'id-king-fahd-complex', qulId: 173, language: 'id', name: 'King Fahd Quran Complex', format: 'footnote-tags', file: /^king-fahad-quran-complex-(?:simple|with-footnote-tags)/i },
    { id: 'id-sabiq', qulId: 194, language: 'id', name: 'Sabiq Company', format: 'footnote-tags', file: /^the-sabiq-company-(?:simple|with-footnote-tags)/i },
    { id: 'ur-junagarhi', qulId: 305, language: 'ur', name: 'Muhammad Junagarhi', format: 'footnote-tags', file: /^ur-junagarri-(?:simple|with-footnote-tags)/i },
    { id: 'bn-abu-bakr-zakaria', qulId: 200, language: 'bn', name: 'Abu Bakr Muhammad Zakaria', format: 'simple', file: /^dr-abu-bakr-muhammad-zakaria-(?:simple|with-footnote-tags)/i },
    { id: 'fa-islamhouse', qulId: 169, language: 'fa', name: 'IslamHouse.com', format: 'simple', file: /^islamhouse-com-(?:simple|with-footnote-tags)/i },
    { id: 'prs-badkhashani', qulId: 291, language: 'prs', name: 'Muhammad Anwar Badakhshani', format: 'simple', file: /^mawlawi-muhammad-anwar-badkhashani-(?:simple|with-footnote-tags)/i },
    { id: 'ms-basumayyah', qulId: 292, language: 'ms', name: 'Abdullah Basamia', format: 'simple', file: /^abdullah-basamia-(?:simple|with-footnote-tags)/i },
    { id: 'hi-al-umari', qulId: 166, language: 'hi', name: 'Azizul Haq al-Umari', format: 'footnote-tags', file: /^maulana-azizul-haque-al-umari-(?:simple|with-footnote-tags)/i },
    { id: 'it-rowwad', qulId: 198, language: 'it', name: 'Othman al-Sharif (Rowwad)', format: 'simple', file: /^othman-al-sharif-(?:simple|with-footnote-tags)/i },
    { id: 'pt-helmi-nasr', qulId: 228, language: 'pt', name: 'Helmi Nasr', format: 'simple', file: /^helmi-nasr-(?:simple|with-footnote-tags)/i },
    { id: 'nl-islamic-center', qulId: 437, language: 'nl', name: 'Dutch Islamic Center', format: 'simple', file: /^dutch-islamic-center-(?:simple|with-footnote-tags)/i },
    { id: 'bs-korkut', qulId: 170, language: 'bs', name: 'Besim Korkut', format: 'simple', file: /^besim-korkut-(?:simple|with-footnote-tags)/i },
    { id: 'bs-mehanovic', qulId: 190, language: 'bs', name: 'Muhamed Mehanović', format: 'simple', file: /^bs-unknown-(?:simple|with-footnote-tags)/i },
    { id: 'sq-nahi', qulId: 303, language: 'sq', name: 'Hasan Efendi Nahi', format: 'footnote-tags', file: /^al-hasan-efendi-(?:simple|with-footnote-tags)/i },
    { id: 'sr-rowwad', qulId: 299, language: 'sr', name: 'Rowwad Translation Center', format: 'simple', file: /^dar-al-salam-center-(?:simple|with-footnote-tags)/i },
    { id: 'hr-rowwad', qulId: 436, language: 'hr', name: 'Rowwad Translation Center', format: 'simple', file: /^croatian-translation-rwwad-(?:simple|with-footnote-tags)/i },
    { id: 'mk-macedonian-scholars', qulId: 289, language: 'mk', name: 'Macedonian scholars', format: 'footnote-tags', file: /^macedonian-scholars-(?:simple|with-footnote-tags)/i },
    { id: 'sw-rowwad', qulId: 466, language: 'sw', name: 'Rowwad Translation Center', format: 'simple', file: /^swahili-translation-rowad-translation-center-(?:simple|with-footnote-tags)/i },
    { id: 'sw-abu-bakr-khamis', qulId: 216, language: 'sw', name: 'Abdullah Muhammad Abu Bakr & Nasir Khamis', format: 'simple', file: /^dr-abdullah-muhammad-abu-bakr-and-sheikh-nasir-khamis-(?:simple|with-footnote-tags)/i },
    { id: 'ha-gumi', qulId: 163, language: 'ha', name: 'Abubakar Mahmud Gumi', format: 'footnote-tags', file: /^abubakar-mahmood-jummi-(?:simple|with-footnote-tags)/i },
    { id: 'so-yacoub', qulId: 290, language: 'so', name: 'Abdullah Hasan Yacoub', format: 'footnote-tags', file: /^abdullah-hassan-yacoub-(?:simple|with-footnote-tags)/i },
    { id: 'am-sadiq-sani', qulId: 234, language: 'am', name: 'Muhammad Sadiq & Muhammad Sani Habib', format: 'simple', file: /^am-sadiq-(?:simple|with-footnote-tags)/i },
    { id: 'am-zain', qulId: 438, language: 'am', name: 'Africa Academy (Zain)', format: 'simple', file: /^amharic-translation-zain-(?:simple|with-footnote-tags)/i },
    { id: 'om-ababor', qulId: 160, language: 'om', name: 'Ghali Apapur Apaghuna', format: 'simple', file: /^ghali-apapur-apaghuna-(?:simple|with-footnote-tags)/i },
    { id: 'om-rowwad', qulId: 580, language: 'om', name: 'Rowwad Translation Center', format: 'simple', file: /^om-rowwad-(?:simple|with-footnote-tags)/i },
    { id: 'yo-mikail', qulId: 167, language: 'yo', name: 'Abu Rahimah Mikail Aykyuni', format: 'footnote-tags', file: /^shaykh-abu-rahimah-mikael-aykyuni-(?:simple|with-footnote-tags)/i },
    { id: 'zh-ma-jian', qulId: 159, language: 'zh', name: 'Muhammad Makin (Ma Jian)', format: 'simple', file: /^muhammad-makin-(?:simple|with-footnote-tags)/i },
    { id: 'zh-suliman', qulId: 428, language: 'zh', name: 'Muhammad Suleiman', format: 'simple', file: /^chinese-suliman-(?:simple|with-footnote-tags)/i },
    { id: 'zh-basair', qulId: 439, language: 'zh', name: 'Basair', format: 'simple', file: /^chinese-translation-basair-(?:simple|with-footnote-tags)/i },
    { id: 'ja-saeed-sato', qulId: 202, language: 'ja', name: 'Saeed Sato', format: 'simple', file: /^saeed-sato-(?:simple|with-footnote-tags)/i },
    { id: 'ko-hamed-choi', qulId: 204, language: 'ko', name: 'Hamed Choi', format: 'simple', file: /^hamed-choi-(?:simple|with-footnote-tags)/i },
    { id: 'th-king-fahd-complex', qulId: 232, language: 'th', name: 'King Fahd Quran Complex', format: 'simple', file: /^quran-th-quran-complex-(?:simple|with-footnote-tags)/i },
    { id: 'vi-rowwad', qulId: 207, language: 'vi', name: 'Rowwad Translation Center', format: 'footnote-tags', file: /^translation-pioneers-center-(?:simple|with-footnote-tags)/i },
    { id: 'vi-hassan-abdul-karim', qulId: 205, language: 'vi', name: 'Hasan Abdul-Karim', format: 'simple', file: /^hasan-abdul-karim-(?:simple|with-footnote-tags)/i },
    { id: 'uz-rowwad', qulId: 447, language: 'uz', name: 'Rowwad Translation Center', format: 'simple', file: /^uzbek-translation-rowwad-translation-center-(?:simple|with-footnote-tags)/i },
    { id: 'uz-mansour', qulId: 225, language: 'uz', name: 'Alauddin Mansour', format: 'footnote-tags', file: /^alauddin-mansour-(?:simple|with-footnote-tags)/i },
    { id: 'uz-sodik', qulId: 168, language: 'uz', name: 'Muhammad Sodik Muhammad Yusuf', format: 'footnote-tags', file: /^muhammad-sodik-muhammad-yusuf-(?:simple|with-footnote-tags)/i },
    { id: 'kk-altay', qulId: 208, language: 'kk', name: 'Khalifa Altay', format: 'simple', file: /^khalifa-altay-(?:simple|with-footnote-tags)/i },
    { id: 'ky-hakimov', qulId: 448, language: 'ky', name: 'Shamsuddin Hakimov', format: 'simple', file: /^kyrgyz-hakimov-(?:simple|with-footnote-tags)/i },
    { id: 'tg-rowwad', qulId: 206, language: 'tg', name: 'Rowwad Translation Center', format: 'simple', file: /^pioneers-of-translation-center-(?:simple|with-footnote-tags)/i },
    { id: 'tg-khawaja', qulId: 175, language: 'tg', name: 'Khawaja Mirof & Khawaja Mir', format: 'footnote-tags', file: /^khawaja-mirof-khawaja-mir-(?:simple|with-footnote-tags)/i },
    { id: 'az-musayev', qulId: 147, language: 'az', name: 'Alikhan Musayev', format: 'simple', file: /^az-alikhan-(?:simple|with-footnote-tags)/i },
    { id: 'ta-omar-sharif', qulId: 214, language: 'ta', name: 'Omar Sharif bin Abdul Salam', format: 'simple', file: /^sheikh-omar-sharif-bin-abdul-salam-(?:simple|with-footnote-tags)/i },
    { id: 'ta-baqavi', qulId: 172, language: 'ta', name: 'Abdul Hameed Baqavi', format: 'simple', file: /^abdul-hameed-baqavi-(?:simple|with-footnote-tags)/i },
    { id: 'ml-kunhi', qulId: 209, language: 'ml', name: 'Abdul Hamid Haidar & Kunhi Muhammad', format: 'simple', file: /^abdul-hamid-haidar-kanhi-muhammad-(?:simple|with-footnote-tags)/i },
    { id: 'te-abdur-rahim', qulId: 210, language: 'te', name: 'Abdur-Rahim ibn Muhammad', format: 'simple', file: /^maulana-abder-rahim-ibn-muhammad-(?:simple|with-footnote-tags)/i },
    { id: 'kn-bashir', qulId: 442, language: 'kn', name: 'Bashir Maisuri', format: 'simple', file: /^kannada-translation-bashir-missouri-(?:simple|with-footnote-tags)/i },
    { id: 'kn-hamza-battur', qulId: 429, language: 'kn', name: 'Muhammad Hamza Battur', format: 'simple', file: /^muhammad-hamza-battur-(?:simple|with-footnote-tags)/i },
    { id: 'gu-al-umari', qulId: 211, language: 'gu', name: 'Rabila al-Umari', format: 'simple', file: /^rabila-al-umry-(?:simple|with-footnote-tags)/i },
    { id: 'mr-ansari', qulId: 213, language: 'mr', name: 'Muhammad Shafi Ansari', format: 'simple', file: /^muhammad-shafi-i-ansari-(?:simple|with-footnote-tags)/i },
    { id: 'ne-ahl-al-hadith', qulId: 158, language: 'ne', name: 'Ahl al-Hadith Central Society of Nepal', format: 'simple', file: /^ahl-al-hadith-central-society-of-nepal-(?:simple|with-footnote-tags)/i },
    { id: 'pa-arif-halim', qulId: 423, language: 'pa', name: 'Arif Halim', format: 'simple', file: /^punjabi-arif-(?:simple|with-footnote-tags)/i },
    { id: 'ps-zakaria', qulId: 164, language: 'ps', name: 'Zakaria Abulsalam', format: 'simple', file: /^zakaria-abulsalam-(?:simple|with-footnote-tags)/i },
    { id: 'ps-rowwad', qulId: 449, language: 'ps', name: 'Rowwad Translation Center', format: 'simple', file: /^pashto-translation-rowwad-translation-center-(?:simple|with-footnote-tags)/i },
    { id: 'ps-sarfaraz', qulId: 440, language: 'ps', name: 'Sarfaraz', format: 'simple', file: /^pashto-sarfaraz-(?:simple|with-footnote-tags)/i },
    { id: 'ckb-salahuddin', qulId: 427, language: 'ckb', name: 'Salahuddin Abdulkarim', format: 'simple', file: /^kurdish-translation-salahuddin-(?:simple|with-footnote-tags)/i },
    { id: 'ckb-bamoki', qulId: 177, language: 'ckb', name: 'Muhammad Saleh Bamoki', format: 'simple', file: /^muhammad-saleh-bamoki-(?:simple|with-footnote-tags)/i },
    { id: 'kmr-ismail', qulId: 434, language: 'kmr', name: 'Ismail Sagiri', format: 'simple', file: /^kurdish-kurmanji-translation-(?:simple|with-footnote-tags)/i },
    { id: 'ug-saleh', qulId: 304, language: 'ug', name: 'Muhammad Saleh', format: 'simple', file: /^ug-saleh-(?:simple|with-footnote-tags)/i },
    { id: 'uk-yakubovych', qulId: 203, language: 'uk', name: 'Mykhaylo Yakubovych', format: 'simple', file: /^dr-mikhailo-yaqubovic-(?:simple|with-footnote-tags)/i },
    { id: 'ro-islam4ro', qulId: 465, language: 'ro', name: 'Islam4ro.com', format: 'simple', file: /^romanian-translation-(?:simple|with-footnote-tags)/i },
    { id: 'bg-translation', qulId: 294, language: 'bg', name: 'Bulgarian translation (Rowwad)', format: 'simple', file: /^bulgarian-translation-(?:simple|with-footnote-tags)/i },
    { id: 'lt-rowwad', qulId: 279, language: 'lt', name: 'Rowwad Translation Center', format: 'footnote-tags', file: /^lithuanian-translation-(?:simple|with-footnote-tags)/i },
    { id: 'el-rowwad', qulId: 464, language: 'el', name: 'Rowwad Translation Center', format: 'simple', file: /^greek-translation-(?:simple|with-footnote-tags)/i },
    { id: 'he-dar-al-salam', qulId: 297, language: 'he', name: 'Dar Al-Salam Center', format: 'simple', file: /^dar-al-salam-center-(?:simple|with-footnote-tags)/i },
    { id: 'rw-muslim-association', qulId: 296, language: 'rw', name: 'Rwanda Muslim Association', format: 'footnote-tags', file: /^the-rwanda-muslims-association-team-(?:simple|with-footnote-tags)/i },
    { id: 'ln-zakaria', qulId: 431, language: 'ln', name: 'Mohammed Balangogo', format: 'simple', file: /^lingala-translation-(?:simple|with-footnote-tags)/i },
    { id: 'mg-rowwad', qulId: 432, language: 'mg', name: 'Rowwad Translation Center', format: 'simple', file: /^malagasy-translation-rowad-(?:simple|with-footnote-tags)/i },
    { id: 'zu-adel-jaffer', qulId: 578, language: 'zu', name: 'Adel Jaffer', format: 'simple', file: /^zulu-translation-adel-jaffer-(?:simple|with-footnote-tags)/i },
    { id: 'sn-dar-al-ilm', qulId: 579, language: 'sn', name: 'Dar Al-Ilm Institute', format: 'simple', file: /^sn-dar-ilam-institute-(?:simple|with-footnote-tags)/i },
    { id: 'ny-betala', qulId: 450, language: 'ny', name: 'Khaled Ibrahim Betala', format: 'simple', file: /^chewa-translation-(?:simple|with-footnote-tags)/i },
    { id: 'ak-harun-ismail', qulId: 285, language: 'ak', name: 'Harun Ismail', format: 'simple', file: /^rowad-translation-center-(?:simple|with-footnote-tags)/i },
    { id: 'ff-rowwad', qulId: 435, language: 'ff', name: 'Rowwad Translation Center', format: 'simple', file: /^rowad-translation-center-(?:simple|with-footnote-tags)/i },
    { id: 'aa-hamza', qulId: 452, language: 'aa', name: 'Mahmoud Abdulkader Hamza', format: 'simple', file: /^shaikh-mahmud-abdulkader-hamza-(?:simple|with-footnote-tags)/i },
    { id: 'dag-gutubu', qulId: 424, language: 'dag', name: 'Muhammad Baba Gutubu', format: 'simple', file: /^muhammad-baba-gutubu-(?:simple|with-footnote-tags)/i },
    { id: 'luy-center', qulId: 444, language: 'luy', name: 'Luhya translation', format: 'simple', file: /^luhya-translation-(?:simple|with-footnote-tags)/i },
    { id: 'rn-gehiti', qulId: 272, language: 'rn', name: 'Yusuf Gahiti', format: 'simple', file: /^ikirundi-gehiti-(?:simple|with-footnote-tags)/i },
    { id: 'mos-rowwad', qulId: 270, language: 'mos', name: 'Rowwad Translation Center', format: 'simple', file: /^moore-rwwad-(?:simple|with-footnote-tags)/i },
    { id: 'yao-silika', qulId: 286, language: 'yao', name: 'Abdul Hamid Silika', format: 'footnote-tags', file: /^abdul-hamid-silika-(?:simple|with-footnote-tags)/i },
    { id: 'ceb-rowwad', qulId: 443, language: 'ceb', name: 'Rowwad Translation Center', format: 'simple', file: /^bisayan-translation-rowwad-center-(?:simple|with-footnote-tags)/i },
    { id: 'mdh-rowwad', qulId: 445, language: 'mdh', name: 'Rowwad Translation Center', format: 'simple', file: /^maguindanao-rwwad-(?:simple|with-footnote-tags)/i },
    { id: 'ill-sarro', qulId: 441, language: 'ill', name: 'Iranun translation (Sarro)', format: 'simple', file: /^filipino-iranionian-translation-(?:simple|with-footnote-tags)/i },
    { id: 'tl-dar-al-salam', qulId: 199, language: 'tl', name: 'Dar Al-Salam Center', format: 'simple', file: /^dar-al-salam-center-(?:simple|with-footnote-tags)/i },
    { id: 'km-cambodian-community', qulId: 171, language: 'km', name: 'Cambodian Muslim Community Development', format: 'simple', file: /^cambodian-muslim-community-development-(?:simple|with-footnote-tags)/i },
    { id: 'km-rowwad', qulId: 425, language: 'km', name: 'Rowwad Translation Center', format: 'simple', file: /^khmer-translation-rwwad-translation-center-(?:simple|with-footnote-tags)/i },
    { id: 'si-rowwad', qulId: 212, language: 'si', name: 'Rowwad Translation Center', format: 'simple', file: /^translation-pioneers-center-(?:simple|with-footnote-tags)/i },
    { id: 'as-rafeequl-islam', qulId: 165, language: 'as', name: 'Rafeequl Islam Habibur-Rahman', format: 'footnote-tags', file: /^shaykh-rafeequl-islam-habibur-rahman-(?:simple|with-footnote-tags)/i },
    { id: 'nqo-kanti', qulId: 288, language: 'nqo', name: 'Suliman Kanti (Bambara, N\'Ko)', format: 'simple', file: /^suliman-kanti-(?:simple|with-footnote-tags)/i },
    { id: 'nqo-baba-mamadi', qulId: 287, language: 'nqo', name: 'Baba Mamady Jani (Bambara, N\'Ko)', format: 'simple', file: /^baba-mamady-jani-(?:simple|with-footnote-tags)/i },
];

/** Object key of a downloaded QUL file in the private sources bucket. */
export const qulSourceKey = (id: QuranTranslationId) => `qul/translations/${id}.json`;
