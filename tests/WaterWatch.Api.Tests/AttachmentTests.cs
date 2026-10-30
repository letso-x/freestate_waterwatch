using System.Buffers.Binary;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection.Extensions;
using WaterWatch.Api.Data;
using WaterWatch.Api.Services;

namespace WaterWatch.Api.Tests;

public sealed class AttachmentTests
{
    private const string Origin = "http://localhost:5173";
    private static readonly string SigningKey = new('s', 64);
    private static WebApplicationFactory<Program> Configure(ApiFactory factory, StorageHandler storage) => factory.WithWebHostBuilder(builder => {
        builder.UseSetting("Storage:SupabaseUrl", "https://storage.example.test");
        builder.UseSetting("Storage:ServiceRoleKey", "storage-test-key");
        builder.UseSetting("Storage:UploadCapabilityKey", SigningKey);
        builder.ConfigureServices(services => { services.RemoveAll<IHttpClientFactory>(); services.AddSingleton<IHttpClientFactory>(new StorageClients(storage)); });
    });
    private static async Task<Guid> Create(HttpClient client, bool photos = true) {
        var response = await client.PostAsJsonAsync("/api/incidents", new { title = "Photo verification", description = "An isolated attachment workflow test.", location = "Test location", requestPhotoUploadCapability = photos });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        if (photos) {
            var cookie = string.Join(";", response.Headers.GetValues("Set-Cookie"));
            Assert.Contains("httponly", cookie.ToLowerInvariant()); Assert.Contains("/attachments", cookie);
        }
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }
    private static MultipartFormDataContent Photo(byte[]? bytes = null, Guid? uploadId = null) {
        var form = new MultipartFormDataContent(); var content = new ByteArrayContent(bytes ?? Png());
        content.Headers.ContentType = new("image/png"); form.Add(content, "photo", "water.png");
        if (uploadId is { } id) form.Add(new StringContent(id.ToString()), "uploadId");
        return form;
    }
    [Fact]
    public async Task ResidentUpload_RequiresScopedCapability_AndStaffRetrievesExactBytes()
    {
        using var root = new ApiFactory(); using var storage = new StorageHandler(); using var factory = Configure(root, storage);
        using var resident = factory.CreateClient(); resident.DefaultRequestHeaders.Authorization = null; resident.DefaultRequestHeaders.Add("Origin", Origin);
        var id = await Create(resident); var bytes = Png(); var uploadId = Guid.NewGuid();
        var uploaded = await resident.PostAsync($"/api/public/incidents/{id}/attachments", Photo(bytes, uploadId));
        Assert.Equal(HttpStatusCode.Created, uploaded.StatusCode);
        var attachment = (await uploaded.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(uploadId, attachment);
        // Lost-response retries reuse the same ID and do not consume another slot.
        Assert.Equal(HttpStatusCode.Created, (await resident.PostAsync($"/api/public/incidents/{id}/attachments", Photo(bytes, uploadId))).StatusCode);
        using var stranger = factory.CreateClient(); stranger.DefaultRequestHeaders.Authorization = null; stranger.DefaultRequestHeaders.Add("Origin", Origin);
        Assert.Equal(HttpStatusCode.Unauthorized, (await stranger.PostAsync($"/api/public/incidents/{id}/attachments", Photo())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await resident.GetAsync($"/api/incidents/{id}/attachments")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await resident.GetAsync($"/api/incidents/{id}/attachments/{attachment}/content")).StatusCode);
        var other = await Create(stranger);
        Assert.Equal(HttpStatusCode.Unauthorized, (await resident.PostAsync($"/api/public/incidents/{other}/attachments", Photo())).StatusCode);
        resident.DefaultRequestHeaders.Remove("Origin"); resident.DefaultRequestHeaders.Add("Origin", "https://untrusted.example");
        Assert.Equal(HttpStatusCode.Unauthorized, (await resident.PostAsync($"/api/public/incidents/{id}/attachments", Photo())).StatusCode);
        using var staff = factory.CreateClient();
        var listed = await staff.GetStringAsync($"/api/incidents/{id}/attachments");
        Assert.DoesNotContain("storagePath", listed); Assert.DoesNotContain("storage-test-key", listed);
        var response = await staff.GetAsync($"/api/incidents/{id}/attachments/{attachment}/content");
        Assert.Equal(bytes, await response.Content.ReadAsByteArrayAsync()); Assert.Equal("image/png", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString()); Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        Assert.Single(await db.IncidentAttachments.Where(x => x.IncidentId == id).ToListAsync());
        Assert.Single(storage.Objects);
    }
    [Fact]
    public async Task ReportLimit_AndRepairUpload_AreEnforcedByBackend()
    {
        using var root = new ApiFactory(); using var storage = new StorageHandler(); using var factory = Configure(root, storage);
        using var resident = factory.CreateClient(); resident.DefaultRequestHeaders.Authorization = null; resident.DefaultRequestHeaders.Add("Origin", Origin); var id = await Create(resident);
        for (var index=0;index<3;index++) Assert.Equal(HttpStatusCode.Created,(await resident.PostAsync($"/api/public/incidents/{id}/attachments",Photo())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,(await resident.PostAsync($"/api/public/incidents/{id}/attachments",Photo())).StatusCode);
        using var staff=factory.CreateClient(); var uploadId=Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Created,(await staff.PostAsync($"/api/incidents/{id}/attachments",Photo(uploadId:uploadId))).StatusCode);
        Assert.Equal(HttpStatusCode.Created,(await staff.PostAsync($"/api/incidents/{id}/attachments",Photo(uploadId:uploadId))).StatusCode);
        var list=await staff.GetFromJsonAsync<JsonElement[]>($"/api/incidents/{id}/attachments"); Assert.Equal(4,list!.Length);
        Assert.Equal("RepairEvidence",list.Single(item=>item.GetProperty("id").GetGuid()==uploadId).GetProperty("attachmentType").GetString());
    }
    [Fact]
    public async Task MissingBucketReportedAs400_IsCreatedPrivately()
    {
        using var root=new ApiFactory();using var storage=new StorageHandler{Missing=true};using var factory=Configure(root,storage);using var client=factory.CreateClient();var id=await Create(client,false);
        Assert.Equal(HttpStatusCode.Created,(await client.PostAsync($"/api/incidents/{id}/attachments",Photo())).StatusCode);
        Assert.False(storage.Missing);Assert.Single(storage.Objects);
    }
    [Theory]
    [InlineData("text")][InlineData("empty")][InlineData("oversize")][InlineData("corrupt")]
    public async Task InvalidPhoto_IsRejectedBeforeStorage(string kind)
    {
        using var root=new ApiFactory();using var storage=new StorageHandler();using var factory=Configure(root,storage);using var client=factory.CreateClient();var id=await Create(client,false);
        var bytes=kind switch { "empty"=>Array.Empty<byte>(), "oversize"=>new byte[ImagePayloadValidator.MaximumBytes+1], "corrupt"=>Png().Select((b,i)=>i==20?(byte)(b^1):b).ToArray(),_=>"not a photo"u8.ToArray() };
        var result=await client.PostAsync($"/api/incidents/{id}/attachments",Photo(bytes)); Assert.Equal(HttpStatusCode.BadRequest,result.StatusCode);Assert.Empty(storage.Objects);
    }
    [Fact]
    public async Task PublicBucket_FailsClosed_AndFailedDatabaseWriteCleansObject()
    {
        using var root=new ApiFactory();using var storage=new StorageHandler{Public=true};using var factory=Configure(root,storage);using var client=factory.CreateClient();var id=await Create(client,false);
        Assert.Equal(HttpStatusCode.ServiceUnavailable,(await client.PostAsync($"/api/incidents/{id}/attachments",Photo())).StatusCode);Assert.Empty(storage.Objects);
        storage.Public=false;
        using var scope=factory.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>();
        await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER reject_attachment BEFORE INSERT ON IncidentAttachments BEGIN SELECT RAISE(ABORT,'test insert failure'); END;");
        Assert.Equal(HttpStatusCode.ServiceUnavailable,(await client.PostAsync($"/api/incidents/{id}/attachments",Photo())).StatusCode);
        Assert.Empty(storage.Objects);Assert.Empty(await db.IncidentAttachments.ToListAsync());
    }
    [Fact]
    public void Capability_IsTimeLimitedScopedAndTamperResistant()
    {
        var config=new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{{"Storage:UploadCapabilityKey",SigningKey}}).Build();
        var service=new ResidentUploadCapability(config);var id=Guid.NewGuid();var token=service.Create(id);
        Assert.True(service.IsValid(id,token));Assert.False(service.IsValid(Guid.NewGuid(),token));Assert.False(service.IsValid(id,id.ToString()));Assert.False(service.IsValid(id,token+"x"));
        var payload=$"{id:N}.{DateTimeOffset.UtcNow.AddSeconds(-2).ToUnixTimeSeconds()}";
        var signature=Convert.ToBase64String(System.Security.Cryptography.HMACSHA256.HashData(System.Text.Encoding.UTF8.GetBytes(SigningKey),System.Text.Encoding.UTF8.GetBytes(payload))).TrimEnd('=').Replace('+','-').Replace('/','_');
        Assert.False(service.IsValid(id,payload+"."+signature));
    }
    [Fact]
    public async Task PhotoWithoutStorageConfiguration_DoesNotCreateIncident()
    {
        using var factory=new ApiFactory();using var client=factory.CreateClient();
        var result=await client.PostAsJsonAsync("/api/incidents",new{title="Photo report",description="A photo-dependent report.",location="Test location",requestPhotoUploadCapability=true});
        Assert.Equal(HttpStatusCode.ServiceUnavailable,result.StatusCode);
        using var scope=factory.Services.CreateScope();Assert.Empty(await scope.ServiceProvider.GetRequiredService<WaterWatchDbContext>().Incidents.ToListAsync());
    }
    internal static byte[] Png()
    {
        using var png=new MemoryStream();png.Write(new byte[]{137,80,78,71,13,10,26,10});
        void Chunk(string type,byte[] data){var header=new byte[4];BinaryPrimitives.WriteInt32BigEndian(header,data.Length);png.Write(header);var typeBytes=System.Text.Encoding.ASCII.GetBytes(type);png.Write(typeBytes);png.Write(data);uint crc=0xffffffff;foreach(var value in typeBytes.Concat(data)){crc^=value;for(var bit=0;bit<8;bit++)crc=(crc&1)!=0?0xedb88320^(crc>>1):crc>>1;}BinaryPrimitives.WriteUInt32BigEndian(header,~crc);png.Write(header);}
        Chunk("IHDR",new byte[]{0,0,0,1,0,0,0,1,8,6,0,0,0});using var compressed=new MemoryStream();using(var zip=new ZLibStream(compressed,CompressionLevel.Fastest,true))zip.Write(new byte[]{0,255,0,0,255});Chunk("IDAT",compressed.ToArray());Chunk("IEND",[]);return png.ToArray();
    }
    private sealed class StorageClients(StorageHandler handler):IHttpClientFactory { public HttpClient CreateClient(string name)=>new(handler,false); }
    private sealed class StorageHandler:HttpMessageHandler
    {
        public bool Public{get;set;} public bool Missing{get;set;} public Dictionary<string,byte[]> Objects{get;}=[];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct){
            Assert.Equal("storage.example.test",request.RequestUri!.Host);Assert.True(request.Headers.Contains("apikey"));
            if(request.RequestUri.AbsolutePath.Contains("/bucket/"))return Missing ? new(HttpStatusCode.BadRequest){Content=JsonContent.Create(new{code="NoSuchBucket",statusCode="404"})} : new(HttpStatusCode.OK){Content=JsonContent.Create(new{@public=Public})};
            if(request.Method==HttpMethod.Post && request.RequestUri.AbsolutePath.EndsWith("/bucket")){using var config=JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));Assert.False(config.RootElement.GetProperty("public").GetBoolean());Assert.Equal(ImagePayloadValidator.MaximumBytes,config.RootElement.GetProperty("file_size_limit").GetInt32());Missing=false;return new(HttpStatusCode.Created);}
            var path=request.RequestUri.AbsolutePath;
            if(request.Method==HttpMethod.Post){Objects[path]=await request.Content!.ReadAsByteArrayAsync(ct);return new(HttpStatusCode.OK);}
            if(request.Method==HttpMethod.Delete){Objects.Remove(path);return new(HttpStatusCode.OK);}
            return Objects.TryGetValue(path,out var bytes)?new(HttpStatusCode.OK){Content=new ByteArrayContent(bytes)}:new(HttpStatusCode.NotFound);
        }
    }
}
