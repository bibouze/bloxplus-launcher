// Gardien : petit programme natif qui remplace BloxPlus (Electron) pendant une partie.
// Il attend la fermeture de toutes les instances de RobloxPlayerBeta.exe, puis relance BloxPlus avec --after-play.
// Usage : gardien.exe --relaunch "<exe>" [--args "<arguments>"] [--multi]
//   --multi : garde le mutex ROBLOX_singletonMutex (multi-instance) pendant toute la partie.
// Sans fenêtre ni console. Se termine seul si Roblox n'apparaît pas dans les 120 s.
// C# 5, aucune dépendance : csc.exe /target:winexe (voir scripts/build-gardien).
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

static class Gardien
{
    const string ProcessName = "RobloxPlayerBeta";
    const int StartTimeoutMs = 120000;
    const int PollMs = 1500;

    [DllImport("kernel32.dll")]
    static extern bool SetProcessWorkingSetSize(IntPtr process, IntPtr min, IntPtr max);

    // Rend à Windows les pages inutilisées : le gardien reste sous quelques Mo de mémoire de travail.
    static void Trim()
    {
        GC.Collect();
        SetProcessWorkingSetSize(Process.GetCurrentProcess().Handle, (IntPtr)(-1), (IntPtr)(-1));
    }

    static int Count()
    {
        Process[] ps = Process.GetProcessesByName(ProcessName);
        int n = ps.Length;
        foreach (Process p in ps) p.Dispose();
        return n;
    }

    static string Arg(string[] a, string name)
    {
        for (int i = 0; i < a.Length - 1; i++)
            if (a[i] == name) return a[i + 1];
        return null;
    }

    static int Main(string[] args)
    {
        string exe = Arg(args, "--relaunch");
        if (string.IsNullOrEmpty(exe)) return 2;
        string extra = Arg(args, "--args");
        bool multi = Array.IndexOf(args, "--multi") >= 0;

        // Un seul gardien à la fois : un second lancement (clic sur le site pendant la partie) s'efface.
        bool created;
        using (Mutex single = new Mutex(true, "BloxPlusGardien", out created))
        {
            if (!created) return 0;

            Mutex roblox = null;
            bool owned = false;
            if (multi) roblox = new Mutex(false, "ROBLOX_singletonMutex");

            long started = Environment.TickCount;
            bool seen = false;
            int zeros = 0;
            while (true)
            {
                // Le mutex est repris dès que BloxPlus (son premier détenteur) a quitté.
                if (roblox != null && !owned)
                {
                    try { owned = roblox.WaitOne(0); }
                    catch (AbandonedMutexException) { owned = true; }
                }

                int n = Count();
                if (n > 0) { seen = true; zeros = 0; }
                else if (seen) { zeros++; if (zeros >= 2) break; } // deux relevés vides : la partie est finie
                else if (unchecked(Environment.TickCount - started) > StartTimeoutMs) return 0;

                Trim();
                Thread.Sleep(PollMs);
            }

            if (owned) { try { roblox.ReleaseMutex(); } catch (ApplicationException) { } }

            ProcessStartInfo psi = new ProcessStartInfo(exe);
            psi.Arguments = (string.IsNullOrEmpty(extra) ? "" : extra + " ") + "--after-play";
            psi.UseShellExecute = false;
            try { Process.Start(psi); } catch (Exception) { return 3; }
            return 0;
        }
    }
}
