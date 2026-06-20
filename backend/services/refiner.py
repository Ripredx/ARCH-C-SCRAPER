import os
import json

def generate_html_report(raw_data, filename):
    active_sites = []
    down_sites = []
    social_media = []
    no_website = []
    
    business_list = raw_data.get("results", []) if isinstance(raw_data, dict) else raw_data
    
    for item in business_list:
        if not isinstance(item, dict):
            continue
            
        status = item.get("site_status")
        if status == "aktif":
            active_sites.append(item)
        elif status == "kapali":
            down_sites.append(item)
        elif status == "sosyal_medya":
            social_media.append(item)
        else: # "yok" or None
            if item.get("website") and item.get("website") != "#":
                # Fallback just in case
                active_sites.append(item)
            else:
                no_website.append(item)

    # Helper function to generate card HTML
    def build_cards(items, color_hex, label_title, action_type="pitch"):
        if not items:
            return ""
        
        html = f"""
  <details class="mt-8 group bg-[#111]/50 border border-gray-800/50 rounded-xl p-4" open>
    <summary class="text-[{color_hex}] font-bold mb-4 border-b border-gray-800 pb-3 flex items-center gap-3 cursor-pointer select-none hover:bg-gray-800/40 p-2 -mx-2 rounded-lg transition-colors list-none outline-none">
      <span class="transform transition-transform duration-300 group-open:rotate-90 flex items-center justify-center w-6 h-6 rounded-full bg-gray-800/80 text-gray-400 text-xs">▶</span>
      <span class="flex-1">{label_title}</span>
      <span class="bg-[{color_hex}]/20 text-[{color_hex}] px-3 py-1 rounded-full text-xs shadow-inner shadow-[{color_hex}]/10">{len(items)} Adet</span>
    </summary>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
"""
        for item in items:
            title = item.get("title") or "Bilinmeyen"
            phone = item.get("phone") or "Telefon Yok"
            address = item.get("address") or "Adres Yok"
            website = item.get("website") or "#"
            url = item.get("url") or "#"
            menu_link = item.get("menu_link")
            is_claimed = item.get("is_claimed", True)
            
            # Badge for unclaimed business
            unclaimed_badge = ""
            if not is_claimed:
                unclaimed_badge = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 mb-2">⚠️ Haritada Sahipsiz</span>'
            
            # WhatsApp logic
            whatsapp_html = ""
            if phone != "Telefon Yok":
                clean_phone = ''.join(c for c in phone if c.isdigit())
                if clean_phone.startswith('0'):
                    clean_phone = '9' + clean_phone
                elif not clean_phone.startswith('90') and len(clean_phone) == 10:
                    clean_phone = '90' + clean_phone
                
                # Check if it's a mobile number roughly (starts with 905)
                if clean_phone.startswith('905') and len(clean_phone) == 12:
                    wa_link = f"https://wa.me/{clean_phone}"
                    whatsapp_html = f'''
                    <a href="{wa_link}" target="_blank" class="w-full mt-2 bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/40 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#25D366] hover:text-white transition-all flex justify-center items-center gap-2">
                      <svg width="16" height="16" style="width: 16px; height: 16px;" class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.126.556 4.195 1.611 6.015L.175 23.364l5.474-1.436A11.966 11.966 0 0 0 12.031 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0zm0 22.008a9.96 9.96 0 0 1-5.086-1.385l-.364-.216-3.774.989.998-3.682-.237-.377A9.957 9.957 0 0 1 2.023 12.03c0-5.525 4.498-10.022 10.008-10.022 5.511 0 10.008 4.497 10.008 10.022 0 5.526-4.497 10.023-10.008 10.023zM17.5 14.524c-.301-.151-1.782-.879-2.057-.979-.275-.1-.476-.151-.676.151-.2.302-.777.98-.952 1.181-.176.201-.351.226-.652.075-.301-.151-1.272-.469-2.423-1.498-.895-.801-1.5-1.792-1.676-2.093-.176-.301-.019-.464.131-.614.135-.135.301-.351.451-.527.151-.176.201-.302.301-.503.101-.201.05-.377-.025-.527-.075-.151-.676-1.631-.926-2.233-.245-.588-.493-.508-.676-.518-.175-.009-.376-.009-.576-.009s-.526.075-.802.376c-.276.302-1.053 1.029-1.053 2.509 0 1.48 1.078 2.911 1.228 3.112.151.201 2.123 3.239 5.143 4.54.718.309 1.278.494 1.716.632.72.228 1.376.196 1.894.119.581-.087 1.782-.728 2.032-1.431.25-.703.25-1.305.175-1.431-.075-.125-.276-.201-.577-.352z"/></svg>
                      WhatsApp'tan Mesaj At
                    </a>
                    '''
            
            menu_html = f'<p class="flex items-center gap-3"><span class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800/50 text-gray-300">🍴</span> <a href="{menu_link}" target="_blank" class="text-gray-300 hover:text-white underline truncate transition-colors">Menüye Git</a></p>' if menu_link else ''
            
            website_html = ""
            if website and website != "#":
                website_html = f"""
          <p class="flex items-center gap-3">
            <span class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800/50 text-gray-300">🔗</span> 
            <a href="{website}" class="text-gray-200 hover:text-[{color_hex}] font-medium truncate transition-colors" target="_blank" title="{website}">{website}</a>
          </p>"""

            action_button = ""
            if action_type == "pitch":
                action_button = f"""
        <div class="mt-5 pt-4 border-t border-gray-800/60">
          <button class="w-full bg-[{color_hex}]/10 text-[{color_hex}] border border-[{color_hex}]/40 px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[{color_hex}] hover:text-white transition-all duration-300 shadow-[0_0_10px_rgba(0,0,0,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] flex justify-center items-center gap-2" data-action="generate-pitch" data-company="{title}" data-url="{website}">
            <span>✨</span> AI İle Satış Metni Yazdır
          </button>
        </div>"""
            else:
                action_button = f"""
        <div class="mt-5 pt-4 border-t border-gray-800/60">
          <button class="w-full bg-[{color_hex}]/10 text-[{color_hex}] border border-[{color_hex}]/40 px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[{color_hex}] hover:text-white transition-all duration-300 shadow-[0_0_10px_rgba(0,0,0,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] flex justify-center items-center gap-2" data-action="deep-crawl" data-company="{title}" data-url="{website}">
            <span>🔍</span> Siteyi Analiz Et (Deep Crawl)
          </button>
        </div>"""

            html += f"""      <div class="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-gray-800 hover:border-[{color_hex}]/70 rounded-xl p-5 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(255,255,255,0.05)] group relative overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-[{color_hex}]/80"></div>
        <h4 class="text-white font-bold text-lg mb-3 group-hover:text-[{color_hex}] transition-colors line-clamp-1 pr-4" title="{title}">{title}</h4>
        
        {unclaimed_badge}
        <div class="space-y-2.5 text-sm text-gray-400 flex-1">
          {website_html}
          <div class="flex flex-col gap-1">
            <p class="flex items-center gap-3"><span class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800/50 text-gray-300">📞</span> <span class="font-medium text-gray-200">{phone}</span></p>
            {whatsapp_html}
          </div>
          
          <p class="flex items-start gap-3" title="{address}">
            <span class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800/50 text-gray-300 shrink-0">📍</span> 
            <span class="line-clamp-2 leading-tight mt-0.5">{address}</span>
          </p>
          
          <p class="flex items-center gap-3">
            <span class="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800/50 text-gray-300">🗺️</span> 
            <a href="{url}" class="text-[{color_hex}]/80 hover:text-[{color_hex}] underline truncate transition-colors" target="_blank" title="Google Haritalar'da Gör">Haritalarda Göster</a>
          </p>
          {menu_html}
        </div>
        {action_button}
      </div>\n"""
        
        html += "    </div>\n  </details>"
        return html

    html_content = '<div class="space-y-8">'
    
    # 1. Sitesi Kapalı / Ulaşılamayanlar (Ölü Link) -> Amber/Orange (#F59E0B)
    html_content += build_cards(down_sites, "#F59E0B", "Sitesi Kapalı / Ulaşılamayanlar (Ölü Link - Büyük Fırsat)", "pitch")
    
    # 2. Hiç Linki Olmayanlar -> Neon Blue (#00FFFF)
    html_content += build_cards(no_website, "#00FFFF", "Web Sitesi Hiç Olmayanlar (Satış Fırsatı)", "pitch")
    
    # 3. Sosyal Medya Profili Olanlar -> Purple (#A855F7)
    html_content += build_cards(social_media, "#A855F7", "Web Sitesi Yerine Sosyal Medya Kullananlar (Fırsat)", "pitch")
    
    # 4. Kurumsal Sitesi Olanlar -> Pink (#FF007F)
    html_content += build_cards(active_sites, "#FF007F", "Aktif Web Sitesi Olan İşletmeler (Rakip/SEO Analizi)", "crawl")
    
    html_content += "\n</div>"

    report_filename = f"report_{filename}.html"
    os.makedirs(os.path.join(os.path.dirname(__file__), '..', 'outputs', 'llm_reports'), exist_ok=True)
    report_filepath = os.path.join(os.path.dirname(__file__), '..', 'outputs', 'llm_reports', report_filename)
    with open(report_filepath, 'w', encoding='utf-8') as f:
        f.write(html_content)

    log_message = f"""> Python Veri Motoru Çalıştırıldı...
> Veri kaynağı rafine edildi: {filename}
> Toplam İşletme Sayısı: {len(business_list)}
> Sınıflandırma:
  - {len(down_sites)} işletmenin sitesi kapalı / bozuk tespit edildi.
  - {len(no_website)} işletmenin hiçbir web bağlantısı bulunamadı.
  - {len(social_media)} işletme sosyal medya (Instagram vb.) kullanıyor.
  - {len(active_sites)} işletmenin aktif kurumsal web sitesi var.
> Detaylı HTML Raporu Başarıyla Oluşturuldu ({report_filename})."""

    return html_content, log_message
