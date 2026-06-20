import os
import json

def generate_html_report(raw_data, filename):
    has_website = []
    no_website = []
    
    business_list = raw_data.get("results", []) if isinstance(raw_data, dict) else raw_data
    
    for item in business_list:
        if not isinstance(item, dict):
            continue
        if item.get("website"):
            has_website.append(item)
        else:
            no_website.append(item)

    html_content = f"""<div class="space-y-8">
  <!-- Fırsatlar Section -->
  <div>
    <h3 class="text-neon-blue font-bold mb-4 border-b border-gray-800 pb-2 flex items-center gap-2">
      Web Sitesi Olmayan İşletmeler (Satış Fırsatı) 
      <span class="bg-neon-blue/20 text-neon-blue px-2 py-0.5 rounded text-xs">{len(no_website)} Adet</span>
    </h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
"""
    for item in no_website:
        title = item.get("title") or "Bilinmeyen"
        phone = item.get("phone") or "Telefon Yok"
        address = item.get("address") or "Adres Yok"
        html_content += f"""      <div class="bg-[#0a0a0a] border border-gray-800 hover:border-neon-blue/50 rounded-lg p-4 flex flex-col transition-colors group">
        <h4 class="text-white font-semibold text-base mb-2 group-hover:text-neon-blue transition-colors line-clamp-1" title="{title}">{title}</h4>
        <div class="space-y-1.5 text-xs text-gray-400 flex-1">
          <p class="flex items-center gap-2"><span class="text-gray-500 w-4">📞</span> {phone}</p>
          <p class="flex items-start gap-2 line-clamp-2" title="{address}"><span class="text-gray-500 w-4">📍</span> {address}</p>
        </div>
        <div class="mt-4 pt-3 border-t border-gray-800/50">
          <button class="w-full bg-neon-blue/10 text-neon-blue border border-neon-blue/30 px-3 py-2 rounded text-xs font-bold hover:bg-neon-blue hover:text-black transition-colors shadow-[0_0_10px_rgba(0,255,255,0.1)] hover:shadow-[0_0_15px_rgba(0,255,255,0.3)]" value="generate-pitch|{title}|">AI İle Satış Metni Yazdır</button>
        </div>
      </div>\n"""

    html_content += f"""    </div>
  </div>
  
  <!-- Rakip/SEO Section -->
  <div>
    <h3 class="text-[#FF007F] font-bold mb-4 border-b border-gray-800 pb-2 flex items-center gap-2">
      Web Sitesi Olan İşletmeler (Rakip Analizi / SEO Fırsatı) 
      <span class="bg-[#FF007F]/20 text-[#FF007F] px-2 py-0.5 rounded text-xs">{len(has_website)} Adet</span>
    </h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
"""
    for item in has_website:
        title = item.get("title") or "Bilinmeyen"
        phone = item.get("phone") or "Telefon Yok"
        address = item.get("address") or "Adres Yok"
        website = item.get("website") or "#"
        menu_link = item.get("menu_link")
        
        menu_html = f'<p class="flex items-center gap-2"><span class="text-gray-500 w-4">🍴</span> <a href="{menu_link}" target="_blank" class="text-gray-300 hover:text-white underline">Menü</a></p>' if menu_link else ''
        
        html_content += f"""      <div class="bg-[#0a0a0a] border border-gray-800 hover:border-[#FF007F]/50 rounded-lg p-4 flex flex-col transition-colors group">
        <h4 class="text-white font-semibold text-base mb-2 group-hover:text-[#FF007F] transition-colors line-clamp-1" title="{title}">{title}</h4>
        <div class="space-y-1.5 text-xs text-gray-400 flex-1">
          <p class="flex items-center gap-2"><span class="text-gray-500 w-4">🔗</span> <a href="{website}" class="text-neon-blue hover:underline truncate" target="_blank" title="{website}">{website}</a></p>
          <p class="flex items-center gap-2"><span class="text-gray-500 w-4">📞</span> {phone}</p>
          <p class="flex items-start gap-2 line-clamp-2" title="{address}"><span class="text-gray-500 w-4">📍</span> {address}</p>
          {menu_html}
        </div>
        <div class="mt-4 pt-3 border-t border-gray-800/50">
          <button class="w-full bg-[#FF007F]/10 text-[#FF007F] border border-[#FF007F]/30 px-3 py-2 rounded text-xs font-bold hover:bg-[#FF007F] hover:text-white transition-colors shadow-[0_0_10px_rgba(255,0,127,0.1)] hover:shadow-[0_0_15px_rgba(255,0,127,0.3)]" value="deep-crawl|{title}|{website}">Siteyi Analiz Et (Deep Crawl)</button>
        </div>
      </div>\n"""

    html_content += """    </div>
  </div>
</div>"""

    report_filename = f"report_{filename}.html"
    report_filepath = os.path.join(os.path.dirname(__file__), '..', 'outputs', report_filename)
    with open(report_filepath, 'w', encoding='utf-8') as f:
        f.write(html_content)

    log_message = f"""> Python Veri Motoru Çalıştırıldı...
> Veri kaynağı rafine edildi: {filename}
> Toplam İşletme Sayısı: {len(business_list)}
> Sınıflandırma:
  - {len(has_website)} işletmenin web sitesi bulundu. (Rakip & SEO)
  - {len(no_website)} işletmenin web sitesi bulunamadı. (Sıcak Satış Fırsatı)
> Detaylı HTML Raporu Başarıyla Oluşturuldu ({report_filename})."""

    return html_content, log_message
