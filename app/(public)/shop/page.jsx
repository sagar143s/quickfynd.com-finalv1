"use client";
import { Suspense, useEffect } from "react";
import ProductCard from "@/components/ProductCard"
import { MoveLeftIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSelector } from "react-redux"

 function ShopContent() {
    // get query params ?search=abc
    const searchParams = useSearchParams();
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const router = useRouter();
    const products = useSelector(state => state.product.list);

    // Debug: Log AI keyword and product names
    useEffect(() => {
        if (search && products?.length) {
            console.log('AI keyword:', search);
            console.log('Product names:', products.map(p => p.name));
            // Log Levenshtein scores for each product
            const searchTerm = search.toLowerCase();
            products.forEach(product => {
                const score = levenshtein(product.name.toLowerCase(), searchTerm);
                console.log(`Product: ${product.name}, Score: ${score}`);
            });
        }
    }, [search, products]);

    // Fuzzy match helper (Levenshtein distance)
    function levenshtein(a, b) {
      const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
      for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
      for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + cost
          );
        }
      }
      return matrix[a.length][b.length];
    }

    let filteredProducts = products.filter(product => {
        // Fuzzy match for search
        if (search) {
            const productName = product.name.toLowerCase();
            const searchTerm = search.toLowerCase();
            // Substring match or Levenshtein distance <= 2
            if (!productName.includes(searchTerm) && levenshtein(productName, searchTerm) > 2) {
                return false;
            }
        }
        // ...existing code for category matching...
        if (category) {
            const productCategory = product.category?.toLowerCase() || '';
            const categorySlug = category.toLowerCase();
            // Convert both to comparable formats
            const productCategorySlug = productCategory.replace(/\s+/g, '-').replace(/[^\w-]/g, '');
            const productCategoryWords = productCategory.replace(/[^\w\s]/g, '').split(/\s+/);
            const searchWords = categorySlug.split('-');
            // Match if: exact slug match OR category contains all search words OR search is contained in category
            const exactMatch = productCategorySlug === categorySlug;
            const containsAllWords = searchWords.every(word => 
                productCategoryWords.some(catWord => catWord.includes(word) || word.includes(catWord))
            );
            const partialMatch = productCategory.includes(categorySlug.replace(/-/g, ' ')) || 
                                 categorySlug.replace(/-/g, ' ').includes(productCategory);
            if (!exactMatch && !containsAllWords && !partialMatch) {
                return false;
            }
        }
        return true;
    });

    // If no products match, show top 3 closest by Levenshtein distance
    if (search && filteredProducts.length === 0 && products.length > 0) {
        const searchTerm = search.toLowerCase();
        const scored = products.map(product => ({
            product,
            score: levenshtein(product.name.toLowerCase(), searchTerm)
        }));
        scored.sort((a, b) => a.score - b.score);
        filteredProducts = scored.slice(0, 3).map(s => s.product);
    }

    const pageTitle = category 
        ? category.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        : search 
        ? `Search: ${search}`
        : 'All Products';

    return (
        <div className="min-h-[70vh] mx-6">
            <div className=" max-w-7xl mx-auto">
                <h1 onClick={() => router.push('/shop')} className="text-2xl text-slate-500 my-6 flex items-center gap-2 cursor-pointer"> 
                    {(search || category) && <MoveLeftIcon size={20} />}  
                    {category ? (
                        <>Category: <span className="text-slate-700 font-medium">{pageTitle}</span></>
                    ) : search ? (
                        <>Search: <span className="text-slate-700 font-medium">{search}</span></>
                    ) : (
                        <>All <span className="text-slate-700 font-medium">Products</span></>
                    )}
                </h1>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mx-auto mb-32">
                    {filteredProducts.length > 0 ? (
                        filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)
                    ) : (
                        <div className="col-span-full text-center py-12">
                            <p className="text-gray-500 text-lg">No products found</p>
                            <button 
                                onClick={() => router.push('/shop')}
                                className="mt-4 px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
                            >
                                View All Products
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}


export default function Shop() {
  return (
    <Suspense fallback={<div>Loading shop...</div>}>
      <ShopContent />
    </Suspense>
  );
}