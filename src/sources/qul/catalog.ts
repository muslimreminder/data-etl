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
    // and Pickthall (public domain). Several QUL names are shared ("Ruwwad Center", "Dar Al-Salam Center").
    { id: 'en-saheeh-international', qulId: 193, language: 'en', name: 'Saheeh International', format: 'footnote-tags', file: /saheeh-international/i },
    { id: 'en-rowwad', qulId: 195, language: 'en', name: 'Rowwad Translation Center', format: 'simple', file: /ruwwad-center/i },
    { id: 'en-hilali-khan', qulId: 121, language: 'en', name: 'Muhammad Taqi-ud-Din al-Hilali & Muhammad Muhsin Khan', format: 'simple', file: /muhsin-khan/i },
    { id: 'en-waleed-bleyhesh', qulId: 451, language: 'en', name: 'Waleed Bleyhesh Omary', format: 'simple', file: /dr-waleed-bleyhesh-omary/i },
    { id: 'en-pickthall', qulId: 145, language: 'en', name: 'Marmaduke Pickthall', format: 'simple', file: /english-translation-pickthall/i },
    { id: 'de-rowwad', qulId: 467, language: 'de', name: 'Rowwad Translation Center', format: 'simple', file: /german-translation-rowwad-translation-center/i },
    { id: 'de-abu-rida', qulId: 197, language: 'de', name: 'Abu Rida Muhammad ibn Ahmad', format: 'simple', file: /abu-reda-muhammad-ibn-ahmad/i },
    { id: 'id-kemenag', qulId: 224, language: 'id', name: 'Kementerian Agama RI', format: 'footnote-tags', file: /indonesian-islamic-affairs-ministry/i },
    { id: 'id-king-fahd-complex', qulId: 173, language: 'id', name: 'King Fahd Quran Complex', format: 'footnote-tags', file: /king-fahad-quran-complex/i },
    { id: 'id-sabiq', qulId: 194, language: 'id', name: 'Sabiq Company', format: 'footnote-tags', file: /the-sabiq-company/i },
    { id: 'ur-junagarhi', qulId: 305, language: 'ur', name: 'Muhammad Junagarhi', format: 'footnote-tags', file: /maulana-muhammad-junagarhi/i },
    { id: 'bn-rowwad', qulId: 589, language: 'bn', name: 'Rowwad Translation Center', format: 'simple', file: /bengali-translation-rowwad-translation-center/i },
    { id: 'bn-abu-bakr-zakaria', qulId: 200, language: 'bn', name: 'Abu Bakr Muhammad Zakaria', format: 'simple', file: /dr-abu-bakr-muhammad-zakaria/i },
    { id: 'fa-islamhouse', qulId: 169, language: 'fa', name: 'IslamHouse.com', format: 'simple', file: /islamhouse-com/i },
    { id: 'prs-badkhashani', qulId: 291, language: 'prs', name: 'Muhammad Anwar Badakhshani', format: 'simple', file: /mawlawi-muhammad-anwar-badkhashani/i },
    { id: 'ms-basumayyah', qulId: 292, language: 'ms', name: 'Abdullah Basamia', format: 'simple', file: /abdullah-basamia/i },
    { id: 'hi-al-umari', qulId: 166, language: 'hi', name: 'Azizul Haq al-Umari', format: 'footnote-tags', file: /maulana-azizul-haque-al-umari/i },
    { id: 'it-rowwad', qulId: 198, language: 'it', name: 'Othman al-Sharif (Rowwad)', format: 'simple', file: /othman-al-sharif/i },
    { id: 'pt-helmi-nasr', qulId: 228, language: 'pt', name: 'Helmi Nasr', format: 'simple', file: /helmi-nasr/i },
    { id: 'nl-islamic-center', qulId: 437, language: 'nl', name: 'Dutch Islamic Center', format: 'simple', file: /dutch-islamic-center/i },
    { id: 'bs-korkut', qulId: 170, language: 'bs', name: 'Besim Korkut', format: 'simple', file: /besim-korkut/i },
    { id: 'bs-mehanovic', qulId: 190, language: 'bs', name: 'Muhamed Mehanović', format: 'simple', file: /muhamed-mehanovic/i },
    { id: 'sq-nahi', qulId: 303, language: 'sq', name: 'Hasan Efendi Nahi', format: 'footnote-tags', file: /hasan-efendi-nahi/i },
    { id: 'sq-rowwad', qulId: 298, language: 'sq', name: 'Rowwad Translation Center', format: 'simple', file: /ruwwad-center/i },
    { id: 'sr-rowwad', qulId: 299, language: 'sr', name: 'Rowwad Translation Center', format: 'simple', file: /dar-al-salam-center/i },
    { id: 'hr-rowwad', qulId: 436, language: 'hr', name: 'Rowwad Translation Center', format: 'simple', file: /croatian-translation-rwwad/i },
    { id: 'mk-macedonian-scholars', qulId: 289, language: 'mk', name: 'Macedonian scholars', format: 'footnote-tags', file: /macedonian-scholars/i },
    { id: 'sw-rowwad', qulId: 466, language: 'sw', name: 'Rowwad Translation Center', format: 'simple', file: /swahili-translation-rowad-translation-center/i },
    { id: 'sw-abu-bakr-khamis', qulId: 216, language: 'sw', name: 'Abdullah Muhammad Abu Bakr & Nasir Khamis', format: 'simple', file: /dr-abdullah-muhammad-abu-bakr-and-sheikh-nasir-khamis/i },
    { id: 'ha-gumi', qulId: 163, language: 'ha', name: 'Abubakar Mahmud Gumi', format: 'footnote-tags', file: /abubakar-mahmood-jummi/i },
    { id: 'so-yacoub', qulId: 290, language: 'so', name: 'Abdullah Hasan Yacoub', format: 'footnote-tags', file: /abdullah-hassan-yacoub/i },
    { id: 'am-sadiq-sani', qulId: 234, language: 'am', name: 'Muhammad Sadiq & Muhammad Sani Habib', format: 'simple', file: /sadiq-and-sani/i },
    { id: 'am-zain', qulId: 438, language: 'am', name: 'Africa Academy (Zain)', format: 'simple', file: /amharic-translation-zain/i },
    { id: 'om-ababor', qulId: 160, language: 'om', name: 'Ghali Apapur Apaghuna', format: 'simple', file: /ghali-apapur-apaghuna/i },
    { id: 'om-rowwad', qulId: 580, language: 'om', name: 'Rowwad Translation Center', format: 'simple', file: /oromo-translation-rowwad-translation-center/i },
    { id: 'yo-mikail', qulId: 167, language: 'yo', name: 'Abu Rahimah Mikail Aykyuni', format: 'footnote-tags', file: /shaykh-abu-rahimah-mikael-aykyuni/i },
    { id: 'zh-ma-jian', qulId: 159, language: 'zh', name: 'Muhammad Makin (Ma Jian)', format: 'simple', file: /muhammad-makin/i },
    { id: 'zh-suliman', qulId: 428, language: 'zh', name: 'Muhammad Suleiman', format: 'simple', file: /chinese-suliman/i },
    { id: 'zh-basair', qulId: 439, language: 'zh', name: 'Basair', format: 'simple', file: /chinese-translation-basair/i },
    { id: 'ja-saeed-sato', qulId: 202, language: 'ja', name: 'Saeed Sato', format: 'simple', file: /saeed-sato/i },
    { id: 'ko-hamed-choi', qulId: 204, language: 'ko', name: 'Hamed Choi', format: 'simple', file: /hamed-choi/i },
    { id: 'ko-rowwad', qulId: 430, language: 'ko', name: 'Rowwad Translation Center', format: 'simple', file: /korean-translation-rowwad-translation-center/i },
    { id: 'th-king-fahd-complex', qulId: 232, language: 'th', name: 'King Fahd Quran Complex', format: 'simple', file: /thai-translatio-king-fahad-quran-complex/i },
    { id: 'vi-rowwad', qulId: 207, language: 'vi', name: 'Rowwad Translation Center', format: 'footnote-tags', file: /ruwwad-center/i },
    { id: 'vi-hassan-abdul-karim', qulId: 205, language: 'vi', name: 'Hasan Abdul-Karim', format: 'simple', file: /hasan-abdul-karim/i },
    { id: 'uz-rowwad', qulId: 447, language: 'uz', name: 'Rowwad Translation Center', format: 'simple', file: /uzbek-translation-rowwad-translation-center/i },
    { id: 'uz-mansour', qulId: 225, language: 'uz', name: 'Alauddin Mansour', format: 'footnote-tags', file: /alauddin-mansour/i },
    { id: 'uz-sodik', qulId: 168, language: 'uz', name: 'Muhammad Sodik Muhammad Yusuf', format: 'footnote-tags', file: /muhammad-sodik-muhammad-yusuf/i },
    { id: 'kk-altay', qulId: 208, language: 'kk', name: 'Khalifa Altay', format: 'simple', file: /khalifa-altay/i },
    { id: 'ky-hakimov', qulId: 448, language: 'ky', name: 'Shamsuddin Hakimov', format: 'simple', file: /kyrgyz-hakimov/i },
    { id: 'tg-rowwad', qulId: 206, language: 'tg', name: 'Rowwad Translation Center', format: 'simple', file: /pioneers-of-translation-center/i },
    { id: 'tg-khawaja', qulId: 175, language: 'tg', name: 'Khawaja Mirof & Khawaja Mir', format: 'footnote-tags', file: /khawaja-mirof-khawaja-mir/i },
    { id: 'az-musayev', qulId: 147, language: 'az', name: 'Alikhan Musayev', format: 'simple', file: /alikhan-musayev/i },
    { id: 'ta-omar-sharif', qulId: 214, language: 'ta', name: 'Omar Sharif bin Abdul Salam', format: 'simple', file: /sheikh-omar-sharif-bin-abdul-salam/i },
    { id: 'ta-baqavi', qulId: 172, language: 'ta', name: 'Abdul Hameed Baqavi', format: 'simple', file: /abdul-hameed-baqavi/i },
    { id: 'ml-kunhi', qulId: 209, language: 'ml', name: 'Abdul Hamid Haidar & Kunhi Muhammad', format: 'simple', file: /abdul-hamid-haidar-kanhi-muhammad/i },
    { id: 'te-abdur-rahim', qulId: 210, language: 'te', name: 'Abdur-Rahim ibn Muhammad', format: 'simple', file: /maulana-abder-rahim-ibn-muhammad/i },
    { id: 'kn-bashir', qulId: 442, language: 'kn', name: 'Bashir Maisuri', format: 'simple', file: /kannada-translation-bashir-missouri/i },
    { id: 'kn-hamza-battur', qulId: 429, language: 'kn', name: 'Muhammad Hamza Battur', format: 'simple', file: /muhammad-hamza-battur/i },
    { id: 'gu-al-umari', qulId: 211, language: 'gu', name: 'Rabila al-Umari', format: 'simple', file: /rabila-al-umry/i },
    { id: 'mr-ansari', qulId: 213, language: 'mr', name: 'Muhammad Shafi Ansari', format: 'simple', file: /muhammad-shafii-ansari/i },
    { id: 'ne-ahl-al-hadith', qulId: 158, language: 'ne', name: 'Ahl al-Hadith Central Society of Nepal', format: 'simple', file: /ahl-al-hadith-central-society-of-nepal/i },
    { id: 'pa-arif-halim', qulId: 423, language: 'pa', name: 'Arif Halim', format: 'simple', file: /punjabi-arif/i },
    { id: 'ps-zakaria', qulId: 164, language: 'ps', name: 'Zakaria Abulsalam', format: 'simple', file: /zakaria-abulsalam/i },
    { id: 'ps-rowwad', qulId: 449, language: 'ps', name: 'Rowwad Translation Center', format: 'simple', file: /pashto-translation-rowwad-translation-center/i },
    { id: 'ps-sarfaraz', qulId: 440, language: 'ps', name: 'Sarfaraz', format: 'simple', file: /pashto-sarfaraz/i },
    { id: 'ckb-salahuddin', qulId: 427, language: 'ckb', name: 'Salahuddin Abdulkarim', format: 'simple', file: /kurdish-translation-salahuddin/i },
    { id: 'ckb-bamoki', qulId: 177, language: 'ckb', name: 'Muhammad Saleh Bamoki', format: 'simple', file: /muhammad-saleh-bamoki/i },
    { id: 'kmr-ismail', qulId: 434, language: 'kmr', name: 'Ismail Sagiri', format: 'simple', file: /kurdish-kurmanji-translation/i },
    { id: 'ug-saleh', qulId: 304, language: 'ug', name: 'Muhammad Saleh', format: 'simple', file: /muhammad-saleh/i },
    { id: 'uk-yakubovych', qulId: 203, language: 'uk', name: 'Mykhaylo Yakubovych', format: 'simple', file: /dr-mikhailo-yaqubovic/i },
    { id: 'ro-islam4ro', qulId: 465, language: 'ro', name: 'Islam4ro.com', format: 'simple', file: /romanian-translation/i },
    { id: 'bg-translation', qulId: 294, language: 'bg', name: 'Bulgarian translation (Rowwad)', format: 'simple', file: /bulgarian-translation/i },
    { id: 'lt-rowwad', qulId: 279, language: 'lt', name: 'Rowwad Translation Center', format: 'footnote-tags', file: /lithuanian-translation/i },
    { id: 'el-rowwad', qulId: 464, language: 'el', name: 'Rowwad Translation Center', format: 'simple', file: /greek-translation/i },
    { id: 'he-dar-al-salam', qulId: 297, language: 'he', name: 'Dar Al-Salam Center', format: 'simple', file: /dar-al-salam-center/i },
    { id: 'rw-muslim-association', qulId: 296, language: 'rw', name: 'Rwanda Muslim Association', format: 'footnote-tags', file: /the-rwanda-muslims-association-team/i },
    { id: 'ln-zakaria', qulId: 431, language: 'ln', name: 'Mohammed Balangogo', format: 'simple', file: /lingala-translation/i },
    { id: 'mg-rowwad', qulId: 432, language: 'mg', name: 'Rowwad Translation Center', format: 'simple', file: /malagasy-translation-rowad/i },
    { id: 'zu-adel-jaffer', qulId: 578, language: 'zu', name: 'Adel Jaffer', format: 'simple', file: /zulu-translation-adel-jaffer/i },
    { id: 'sn-dar-al-ilm', qulId: 579, language: 'sn', name: 'Dar Al-Ilm Institute', format: 'simple', file: /shona-translation-dar-al-ilm-institute/i },
    { id: 'ny-betala', qulId: 450, language: 'ny', name: 'Khaled Ibrahim Betala', format: 'simple', file: /chewa-translation/i },
    { id: 'ak-harun-ismail', qulId: 285, language: 'ak', name: 'Harun Ismail', format: 'simple', file: /sheikh-haroun-ismaeel/i },
    { id: 'ff-rowwad', qulId: 435, language: 'ff', name: 'Rowwad Translation Center', format: 'simple', file: /fulani-translation/i },
    { id: 'aa-hamza', qulId: 452, language: 'aa', name: 'Mahmoud Abdulkader Hamza', format: 'simple', file: /shaikh-mahmud-abdulkader-hamza/i },
    { id: 'dag-gutubu', qulId: 424, language: 'dag', name: 'Muhammad Baba Gutubu', format: 'simple', file: /muhammad-baba-gutubu/i },
    { id: 'luy-center', qulId: 444, language: 'luy', name: 'Luhya translation', format: 'simple', file: /luhya-translation/i },
    { id: 'lg-african-development', qulId: 217, language: 'lg', name: 'African Development Foundation', format: 'simple', file: /african-development-foundation/i },
    { id: 'rn-gehiti', qulId: 272, language: 'rn', name: 'Yusuf Gahiti', format: 'simple', file: /ikirundi-gehiti/i },
    { id: 'mos-rowwad', qulId: 270, language: 'mos', name: 'Rowwad Translation Center', format: 'footnote-tags', file: /moore-rwwad/i },
    { id: 'yao-silika', qulId: 286, language: 'yao', name: 'Abdul Hamid Silika', format: 'footnote-tags', file: /abdul-hamid-silika/i },
    { id: 'ceb-rowwad', qulId: 443, language: 'ceb', name: 'Rowwad Translation Center', format: 'simple', file: /bisayan-translation-rowwad-center/i },
    { id: 'mdh-rowwad', qulId: 445, language: 'mdh', name: 'Rowwad Translation Center', format: 'simple', file: /maguindanao-rwwad/i },
    { id: 'ill-sarro', qulId: 441, language: 'ill', name: 'Iranun translation (Sarro)', format: 'simple', file: /filipino-iranionian-translation/i },
    { id: 'tl-dar-al-salam', qulId: 199, language: 'tl', name: 'Dar Al-Salam Center', format: 'simple', file: /dar-al-salam-center/i },
    { id: 'km-cambodian-community', qulId: 171, language: 'km', name: 'Cambodian Muslim Community Development', format: 'simple', file: /cambodian-muslim-community-development/i },
    { id: 'km-rowwad', qulId: 425, language: 'km', name: 'Rowwad Translation Center', format: 'simple', file: /khmer-translation-rwwad-translation-center/i },
    { id: 'si-rowwad', qulId: 212, language: 'si', name: 'Rowwad Translation Center', format: 'simple', file: /ruwwad-center/i },
    { id: 'as-rafeequl-islam', qulId: 165, language: 'as', name: 'Rafeequl Islam Habibur-Rahman', format: 'footnote-tags', file: /shaykh-rafeequl-islam-habibur-rahman/i },
    { id: 'nqo-kanti', qulId: 288, language: 'nqo', name: 'Suliman Kanti (Bambara, N\'Ko)', format: 'simple', file: /suliman-kanti/i },
    { id: 'nqo-baba-mamadi', qulId: 287, language: 'nqo', name: 'Baba Mamady Jani (Bambara, N\'Ko)', format: 'simple', file: /baba-mamady-jani/i },
];

/** Object key of a downloaded QUL file in the private sources bucket. */
export const qulSourceKey = (id: QuranTranslationId) => `qul/translations/${id}.json`;
